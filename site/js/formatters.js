/* js/formatters.js */

async function fetchUnitSymbol(unitQid) {
    try {
      const url = "https://www.wikidata.org/wiki/Special:EntityData/" + unitQid + ".json";
      const data = await persistentCachedJSONFetch(url);
      const entity = data.entities[unitQid];
      if (entity && entity.claims && entity.claims.P5061 && entity.claims.P5061.length > 0) {
        const symbolClaim = entity.claims.P5061[0];
        if (symbolClaim.mainsnak && symbolClaim.mainsnak.datavalue) {
          let symbol = symbolClaim.mainsnak.datavalue.value;
          if (typeof symbol === "object" && symbol.text) {
            return symbol.text;
          }
          return symbol;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }
  
  async function formatQuantityValue(value) {
    let amount = value.amount;
    if (amount.startsWith("+")) amount = amount.slice(1);
    let unit = value.unit;
    if (unit === "1") {
      return amount;
    } else {
      let unitQid = unit.split("/").pop();
      let unitSymbol = await fetchUnitSymbol(unitQid);
      if (unitSymbol) {
        return amount + " " + `<a href="https://www.wikidata.org/wiki/${unitQid}" target="_blank">${unitSymbol}</a>`;
      } else {
        return amount + " " + `<a href="https://www.wikidata.org/wiki/${unitQid}" target="_blank">${unitQid}</a>`;
      }
    }
  }
  
  async function formatTimeValue(value) {
    let timeStr = value.time;
    if (timeStr.startsWith("+")) timeStr = timeStr.slice(1);
    let timezone = value.timezone;
    let precision = value.precision;
    let calendarModel = value.calendarmodel;
    let calendarQid = calendarModel.split("/").pop();
    return `${timeStr} <span class="small-id">(tz: ${timezone}, precision: ${precision}, calendar: <a href="https://www.wikidata.org/wiki/${calendarQid}" target="_blank">${calendarQid}</a>)</span>`;
  }
  
  async function formatWikidataValue(value) {
    if (typeof value !== "object") return String(value);
    if ("amount" in value && "unit" in value) {
      return await formatQuantityValue(value);
    }
    if ("text" in value && "language" in value) {
      return value.text;
    }
    if ("time" in value) {
      return await formatTimeValue(value);
    }
    return JSON.stringify(value);
  }
  