/**
 * Generate HTML documentation for each plugin, complete with
 * documentation on each interface/type used, and inline
 * comments with any code snippets or examples.
 */
var fs = require('fs');
var os = require('os');
var path = require('path');

var SITE_DIR = path.join(process.cwd(), '../site');

const buildTypeLookup = (nodes) => {
  let d = {};
  nodes.forEach(n => d[n.id] = n);
  return d;
};

const writeDocumentationHtmlOutput = (plugin, string) => {
  const pluginNameSplitCapitalized = plugin.name.match(/[A-Z][a-z]+/g);
  const targetDirName = pluginNameSplitCapitalized.slice(0, pluginNameSplitCapitalized.length-1).join('-').toLowerCase();
  const p = path.join(SITE_DIR, 'www/docs-content/apis', targetDirName, 'api.html');
  console.log('WRITING', p);
  try {
    fs.writeFileSync(p, string, { encoding: 'utf8' });
  } catch(e) {
    console.error('Unable to write docs for plugin ', targetDirName);
  }
};

const generateDocumentationForPlugin = (plugin) => {
  //console.log(`\n\nPlugin: ${plugin.name}`);
  var html = [
    `<div class="avc-code-plugin">
      <div class="avc-code-plugin-name">${plugin.name}</div>
    `
  ];

  const interfacesUsedMap = {};
  const interfacesUsed = [];
  let methodChildren = plugin.children.filter(m => m.name != 'addListener' && m.name != 'removeListener');
  let listenerChildren = plugin.children.filter(m => m.name == 'addListener' || m.name == 'removeListener');

  const methodBuild = (method) => {
    // Only support methods with signatures, meaning they are our subclasses
    // implementation of it not our superclass' (I think...)
    if(!method.signatures) { return; }

    html = html.concat(generateMethod(method));
    const interfaces = getInterfacesUsedByMethod(method);

    // Dedupe the interfaces found in each method
    interfacesUsed.push(...interfaces.filter(i => {
      if(interfacesUsedMap.hasOwnProperty(i.id)) {
        return false;
      }
      interfacesUsedMap[i.id] = i;
      return true;
    }));
  }

  methodChildren.forEach(method => methodBuild(method));
  listenerChildren.forEach(method => methodBuild(method));

  interfacesUsed.forEach(interface => {
    if(interface.name == 'Promise') { return; }
    html.push(`
    <div class="avc-code-interface">
      <div class="avc-code-line">
        <span class="avc-code-keyword">interface</span> <span class="avc-code-type-name">${interface.name}</span>
        <span class="avc-code-brace">{</span>
      </div>
    `);

    const interfaceDecl = typeLookup[interface.id];
    if(!interfaceDecl) {
      html.push(`<span class="avc-code-line"><span class="avc-code-brace">}</span></span>`);
      return;
    }

    if(interfaceDecl.children) {
      html.push(...interfaceDecl.children.map(c => {
        return `
          <div class="avc-code-line"><span class="avc-code-param-name">${c.name}</span>
            ${c.flags && c.flags.isOptional ? '<span class="avc-code-param-optional">?</span>' : ''}
            : ${c.type && `<avc-code-type type-id="${c.type.id}">${c.type.name}</avc-code-type>` || ''}</div>`;
      }));
    }
    html.push(`<span class="avc-code-line"><span class="avc-code-brace">}</span></span>`);
  });

  html.push(`</div>`);

  return html.join('\n');
};

const getInterfacesUsedByMethod = (method) => {
  const interfaceTypes = [];

  const signature = method.signatures[0];

  // Build the params portion of the method
  const params = signature.parameters;

  const returnTypes = [];
  returnTypes.push(signature.type);
  signature.type.typeArguments && signature.type.typeArguments.forEach(arg => {
    returnTypes.push(arg);
  })

  if(!params) { return []; }

  return params.map(param => {
    const t = param.type.type;
    if(t == 'reference') {
      return param.type;
    }
  }).filter(n => n).concat(returnTypes.map(type => {
    const t = type.type;
    if(t == 'reference') {
      return type;
    }
  }).filter(n => n));
};

const generateMethod = (method) => {
  const signature = generateMethodSignature(method);
  const params = generateMethodParamDocs(method);
  return signature + params;
};

const generateMethodParamDocs = (method) => {
  const signature = method.signatures[0];

  const html = ['<div class="avc-code-method-params">']

  // Build the params portion of the method
  const params = signature.parameters;
  params && params.forEach((param, i) => {
    html.push(`<div class="avc-code-method-param-info">
                <span class="avc-code-method-param-info-name">${param.name}</span>
                `)
    if (param.type.type == 'reference') {
      if(param.type.id) {
        html.push(`<avc-code-type type-id="${param.type.id}">${param.type.name}</avc-code-type>`);
      } else {
        html.push(`<avc-code-type>${param.type.name}</avc-code-type>`);
      }
    } else {
      html.push(`<span class="avc-code-type-name">${param.type.name}</span>`);
    }

    if (param.comment) {
      html.push(`<div class="avc-code-method-param-comment">${param.comment.text}</div>`);
    }
    html.push('</div>');
  });

  html.push('</div>');
  return html.join('\n');
}

const generateMethodSignature = (method) => {
  const parts = [`<div class="avc-code-method">
                    <span class="avc-code-method-name">${method.name}</span>`, '<span class="avc-code-paren">(</span>'];
  const signature = method.signatures[0];

  // Build the params portion of the method
  const params = signature.parameters;
  params && params.forEach((param, i) => {
    parts.push(`<span class="avc-code-param-name">${param.name}</span>`)

    if(param.flags && param.flags.isOptional) {
      parts.push('<span class="avc-code-param-optional">?</span>');
    }

    parts.push('<span class="avc-code-param-colon">:</span> ');
    parts.push(getParamTypeName(param));
    if(i < params.length-1) {
      parts.push(', ');
    }
  });
  parts.push('<span class="avc-code-paren">)</span><span class="avc-code-return-type-colon">:</span> ');

  const returnType = signature.type;

  // Add the return type of the method
  parts.push(getReturnTypeName(returnType));

  parts.push(`
    ${signature.comment && `<div class="avc-code-method-comment">${signature.comment.shortText}</div>` || ''}
  </div>`);

  return parts.join('');
}

const getParamTypeName = (param) => {
  const t = param.type.type;
  if(t == 'reference') {
    if(param.type.id) {
      return `<avc-code-type type-id="${param.type.id}">${param.type.name}</avc-code-type>`;
    }
    return `<avc-code-type>${param.type.name}</avc-code-type>`;
  } else if(t == 'intrinsic') {
    return param.type.name;
  }
  return 'any';
};

const getReturnTypeName = (returnType) => {
  const r = returnType;

  const html = []
  if(r.type == 'reference' && r.id) {
    html.push(`<avc-code-type type-id="${r.id}">${r.name}</avc-code-type>`);
  } else {
    html.push(`${r.name}`);
  }

  if(r.typeArguments) {
    html.push('<span class="avc-code-typearg-bracket">&lt;</span>');
    r.typeArguments.forEach(a => {
      if(a.id) {
        html.push(`<avc-code-type type-id="${a.id}">${a.name}</avc-code-type>`);
      } else {
        html.push(a.name);
      }
    })
    html.push('<span class="avc-code-typearg-bracket">&gt;</span>');
  }

  return html.join('');
};

// int main(int argc, char **argv) {

let json = JSON.parse(fs.readFileSync('dist/docs.json'));

// Get the core-plugin-definitions.ts child and all of its children
var moduleChildren = json.children[0].children;

let typeLookup = buildTypeLookup(moduleChildren);

// Generate documentation for each plugin

// Plugins are defined as BlahPlugin
let plugins = moduleChildren.filter(c => c.name.endsWith('Plugin'));

plugins.forEach(plugin => writeDocumentationHtmlOutput(plugin, generateDocumentationForPlugin(plugin)));

// }