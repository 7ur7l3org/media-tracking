// put the space-separated list of wd:QID into the VALUES

(async function() {
  const query = `
    SELECT ?item ?itemLabel ?itemDescription WHERE {
      VALUES ?item { wd:Q117467246 }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;
  
  const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query) + "&format=json";
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    data.results.bindings.forEach(binding => {
      const item = binding.item.value.split("/").pop();
      const label = binding.itemLabel.value;
      const description = binding.itemDescription ? binding.itemDescription.value : "No description";
      console.log(`${item}: ${label} – ${description}`);
    });
  } catch (error) {
    console.error("Error fetching SPARQL data:", error);
  }
})();