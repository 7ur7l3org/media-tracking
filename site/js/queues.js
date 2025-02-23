/* js/queues.js */
document.addEventListener("DOMContentLoaded", function() {
  // Format a date as "YYYY-MM-DD hh:mm:ss AM/PM TZN"
  function formatFullDate(date) {
    const datePart = date.toLocaleDateString('en-CA'); // e.g. "2025-02-22"
    const timePart = date.toLocaleTimeString('en-US', { 
      hour12: true, 
      timeZoneName: 'shortGeneric' 
    });
    return `${datePart} ${timePart}`;
  }
  
  loadBackendData().then(data => {
    // Aggregate queue votes by category.
    const categoryMap = {};
    for (let key in data) {
      const entry = data[key];
      if (entry["queue-votes"]) {
        let qid = key.split("/").pop();
        let title = (entry.meta && entry.meta.title) || key;
        let description = (entry.meta && entry.meta.description) || "";
        // Process each queue category.
        for (let cat in entry["queue-votes"]) {
          const votes = entry["queue-votes"][cat];
          if (!votes || votes.length === 0) continue;
          // Compute the latest vote date.
          let latestVote = votes.reduce((acc, vote) => {
            let d = new Date(vote.when);
            return d > acc ? d : acc;
          }, new Date(0));
          // For each vote, create a span with tooltip.
          let voteSpans = votes.map(vote => {
            return `<span title="${vote.note.replace(/"/g, '&quot;')}">${formatFullDate(new Date(vote.when))}</span>`;
          }).join(", ");
          // Build the aggregated representation.
          let voteRepr = `${cat} ${votes.length > 1 ? "x" + votes.length : ""} (${voteSpans})`;
          
          // Media info: title, QID, and description.
          let mediaInfo = `<a href="index.html?id=${qid}">${title}</a> <span class="small-id">(${qid})</span> - ${description}`;
          
          let entryObj = {
            voteRepr,
            mediaInfo,
            latestVote
          };
          
          if (!categoryMap[cat]) {
            categoryMap[cat] = [];
          }
          categoryMap[cat].push(entryObj);
        }
      }
    }
    
    let html = "";
    let categories = Object.keys(categoryMap);
    categories.sort();
    categories.forEach(cat => {
      if (!categoryMap[cat] || categoryMap[cat].length === 0) return;
      // Sort entries descending by latest vote date.
      categoryMap[cat].sort((a, b) => b.latestVote - a.latestVote);
      html += `<details class="queue-category" open>
                 <summary>${cat} (${categoryMap[cat].length} entries)</summary>
                 <table class="backend-table"><thead><tr><th>Queue Votes</th><th>Media</th></tr></thead><tbody>`;
      categoryMap[cat].forEach(entryObj => {
        html += `<tr>
                   <td>${entryObj.voteRepr}</td>
                   <td>${entryObj.mediaInfo}</td>
                 </tr>`;
      });
      html += "</tbody></table></details>";
    });
    
    if (html === "") {
      html = "<p>No queue votes found.</p>";
    }
    
    let navHtml = `<p><a href="queues.html">All Queues</a>`;
    let knownCategories = ["watchlist"];
    knownCategories.forEach(cat => {
      navHtml += ` | <a href="queues.html?queue=${cat}">${cat}</a>`;
    });
    navHtml += "</p>";
    
    document.getElementById("queuesDisplay").innerHTML = navHtml + html;
  }).catch(err => {
    console.error(err);
    document.getElementById("queuesDisplay").innerHTML = "<p>Error loading queue votes.</p>";
  });
});
