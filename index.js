var path = require('path');
var postcss = require('postcss');
require('string.prototype.includes');

const defaultResolutions = [
  '(min-resolution: 192dpi)',
  '(min-resolution: 2dppx)'
];

module.exports = postcss.plugin('postcss-at2x', at2x);

function at2x({ 
  identifier = '@2x',
  use_assets_size = true 
} = {}) {
  return function(root) {
    // Create an empty rule so that all the new rules can be appended to this
    // and then append it at the end.
    const ruleContainer = postcss.root();

    root.walkRules((rule) => {
      const mediaParent = rule.parent;

      // Check for any `background-size` declarations and keep a reference to it
      // These need to be added again to prevent it being overridden by usage of
      // the `background` shorthand
      let backgroundSize;
      rule.walkDecls('background-size', decl => backgroundSize = decl);

      rule.walkDecls(/^background/, (decl) => {
        if (!backgroundWithHiResURL(decl.value)) {
          return;
        }

        // Construct a duplicate rule but with the image urls
        // replaced with retina versions
        const retinaRule = postcss.rule({ selector: decl.parent.selector });
        retinaRule.append(postcss.decl({
          prop: decl.prop,
          value: createRetinaUrl(decl.value, identifier)
        }));

        // Remove keyword from original declaration here as createRetinaUrl
        // needs it for regex search
        decl.value = removeKeyword(decl.value);

        if (backgroundSize) {
          retinaRule.append(postcss.decl(backgroundSize));
        } else if(use_assets_size && !decl.value.includes('#')/*ignore postcss-easysprite files*/) {
          var url = decl.value.match(/\((.*?)\)/)[1].replace(/('|")/g,'');
          retinaRule.append(postcss.decl({
            prop: 'background-size',
            value: `size('${url}')`
          }))
        }

        // Create the rules and append them to the container
        const params = mediaParent.name === 'media' ?
                        combineMediaQuery(mediaParent.params.split(/,\s*/), defaultResolutions) :
                        defaultResolutions.join(', ');
        const mediaAtRule = postcss.atRule({ name: 'media', params });

        mediaAtRule.append(retinaRule);
        ruleContainer.append(mediaAtRule);
      });
    });

    root.append(ruleContainer);
  };
}

/**
 * Add all the resolutions to each media query to scope them
 */
function combineMediaQuery(queries, resolutions) {
  return queries.reduce((finalQuery, query) => {
    resolutions.forEach(resolution => finalQuery.push(`${query} and ${resolution}`));
    return finalQuery;
  }, []).join(', ');
}

// Matches `url()` content as long as it is followed by `at-2x`
const urlPathRegex = /url\(([^\r\n]+)\)(?:[^\r\n]+)?at-2x/gm;

function createRetinaUrl(bgValue, identifier) {
  let match;
  // Loop over all occurances of `url()` and match the path
  while ((match = urlPathRegex.exec(bgValue)) !== null) {
    const [, imgUrl] = match;
    const extension = path.extname(imgUrl);

    if (extension === '.svg') {
      break;
    }

    // File name without extension
    const filename = path.basename(path.basename(imgUrl), extension);

    // Replace with retina filename
    bgValue = bgValue.replace(filename + extension, filename + identifier + extension);
  }

  return removeKeyword(bgValue);
}

function removeKeyword(str) {
  return str.replace(/\sat-2x/g, '');
}

function backgroundWithHiResURL(bgValue) {
  return bgValue.includes('url(') && bgValue.includes('at-2x');
}
