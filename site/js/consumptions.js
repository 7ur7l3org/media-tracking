/* js/consumptions.js */
document.addEventListener("DOMContentLoaded", function() {
  // Format a date as "YYYY-MM-DD hh:mm:ss AM/PM TZN"
  function formatFullDate(date) {
    const datePart = date.toLocaleDateString('en-CA'); // e.g. "2025-02-22"
    const timePart = date.toLocaleTimeString('en-US', { hour12: true, timeZoneName: 'shortGeneric' });
    return `${datePart} ${timePart}`;
  }
  
  loadBackendData().then(data => {
    let events = [];
    // Create one event per consumption.
    for (let key in data) {
      let entry = data[key];
      if (entry.consumptions && entry.consumptions.length > 0) {
        let qid = key.split("/").pop();
        let title = (entry.meta && entry.meta.title) || key;
        let description = (entry.meta && entry.meta.description) || "";
        entry.consumptions.forEach(consumption => {
          events.push({
            date: new Date(consumption.when),
            note: consumption.note || "",
            qid,
            title,
            description
          });
        });
      }
    }
    // Sort events descending by date.
    events.sort((a, b) => b.date - a.date);
    
    // Update the header with the count.
    document.getElementById("consumptionsHeader").textContent = `All Consumptions (${events.length})`;
    
    let html = "<table class='backend-table'><thead><tr><th>Consumption</th><th>Media</th></tr></thead><tbody>";
    events.forEach(event => {
      let dateStr = formatFullDate(event.date);
      // Consumption cell: plain formatted date with tooltip showing the note.
      let consumptionCell = `<span title="${event.note}">${dateStr}</span>`;
      // Media cell: title (as link), QID, and description.
      let mediaCell = `<a href="index.html?id=${event.qid}">${event.title}</a> <span class="small-id">(${event.qid})</span> - ${event.description}`;
      
      html += `<tr>
                 <td>${consumptionCell}</td>
                 <td>${mediaCell}</td>
               </tr>`;
    });
    html += "</tbody></table>";
    document.getElementById("consumptionsDisplay").innerHTML = html;
  }).catch(err => {
    console.error(err);
    document.getElementById("consumptionsDisplay").innerHTML = "<p>Error loading consumptions.</p>";
  });
});
