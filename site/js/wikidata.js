/* js/wikidata.js */

function chunkArray(arr, chunkSize) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += chunkSize) {
      chunks.push(arr.slice(i, i + chunkSize));
    }
    return chunks;
  }
  
  function fetchWikidataItemLabels(itemIds) {
    if (itemIds.length === 0) return Promise.resolve({});
    const chunks = chunkArray(itemIds, 50);
    const requests = chunks.map(chunk => {
      const url = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" +
                  chunk.join("|") +
                  "&languages=en&props=labels&format=json&origin=*";
      return persistentCachedJSONFetch(url)
        .then(data => {
          const mapping = {};
          if (data.entities) {
            for (let id in data.entities) {
              if (data.entities[id].labels && data.entities[id].labels.en) {
                mapping[id] = data.entities[id].labels.en.value;
              }
            }
          }
          return mapping;
        });
    });
    return Promise.all(requests).then(results => {
      return results.reduce((acc, curr) => Object.assign(acc, curr), {});
    }).catch(err => {
      console.error("Error in fetchWikidataItemLabels:", err);
      return {};
    });
  }
  
  function fetchWikidataEntities(itemIds) {
    if (itemIds.length === 0) return Promise.resolve({});
    const url = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" +
                itemIds.join("|") + "&languages=en&props=labels|descriptions&format=json&origin=*";
    return persistentCachedJSONFetch(url)
      .then(data => {
        const mapping = {};
        if (data.entities) {
          for (let id in data.entities) {
            const ent = data.entities[id];
            mapping[id] = {
              label: (ent.labels && ent.labels.en) ? ent.labels.en.value : id,
              description: (ent.descriptions && ent.descriptions.en) ? ent.descriptions.en.value : ""
            };
          }
        }
        return mapping;
      })
      .catch(err => {
        console.error("Error fetching entities:", err);
        return {};
      });
  }
  
  function fetchEntitiesClaims(itemIds) {
    if (itemIds.length === 0) return Promise.resolve({});
    const url = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" +
                itemIds.join("|") + "&props=claims&format=json&origin=*";
    return persistentCachedJSONFetch(url)
      .then(data => data.entities || {})
      .catch(err => {
        console.error("Error fetching entities claims:", err);
        return {};
      });
  }
  
  function fetchPropertyDefinitions(propIDs) {
    const chunks = chunkArray(propIDs, 20);
    const requests = chunks.map(chunk => {
      const url = "https://www.wikidata.org/w/api.php?action=wbgetentities&ids=" +
                  chunk.join("|") + "&languages=en&props=labels|claims&format=json&origin=*";
      return persistentCachedJSONFetch(url)
        .then(data => {
          const mapping = {};
          if (data.entities) {
            for (let id in data.entities) {
              const ent = data.entities[id];
              const label = (ent.labels && ent.labels.en) ? ent.labels.en.value : id;
              const formatter = getPropertyFormatter(ent);
              mapping[id] = { label, formatter, claims: ent.claims };
            }
          }
          return mapping;
        })
        .catch(error => {
          console.error("Error fetching property definitions:", error);
          return {};
        });
    });
    return Promise.all(requests).then(results => results.reduce((acc, curr) => Object.assign(acc, curr), {}));
  }
  
  function getPropertyFormatter(propDef) {
    if (propDef.claims && propDef.claims.P1630 && propDef.claims.P1630.length > 0) {
      const formatterClaim = propDef.claims.P1630[0];
      if (formatterClaim.mainsnak && formatterClaim.mainsnak.datavalue) {
        return formatterClaim.mainsnak.datavalue.value;
      }
    }
    return null;
  }
  
  function getPropertyClosure(propertyIds) {
    const valuesStr = propertyIds.map(id => "wd:" + id).join(" ");
    const query = `
      SELECT ?property ?parent WHERE {
        VALUES ?property { ${valuesStr} }
        ?property wdt:P31/wdt:P279* ?parent .
      }
    `;
    const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query) + "&format=json";
    return persistentCachedJSONFetch(url)
      .then(data => {
        const closure = {};
        data.results.bindings.forEach(binding => {
          const propId = binding.property.value.split("/").pop();
          const parentId = binding.parent.value.split("/").pop();
          if (!closure[propId]) closure[propId] = new Set();
          closure[propId].add(parentId);
        });
        for (let prop in closure) {
          closure[prop] = Array.from(closure[prop]);
        }
        return closure;
      });
  }
  