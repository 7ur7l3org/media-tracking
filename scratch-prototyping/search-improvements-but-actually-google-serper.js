// thanks https://chatgpt.com/c/6848beb1-a9b4-800c-a335-0dcc3fd8f0bf
// https://serper.dev/playground

// actually https://programmablesearchengine.google.com/controlpanel/overview?cx=a0b2e7234750e43d4 , https://developers.google.com/custom-search/v1/introduction , https://cse.google.com/cse?cx=a0b2e7234750e43d4#gsc.tab=0&gsc.q=maid&gsc.sort= just actually works. set to only site wikidata.org . i should just use google itself for 100 searches per day - Custom Search JSON API provides 100 search queries per day for free. If you need more, you may sign up for billing in the API Console. Additional requests cost $5 per 1000 queries, up to 10k queries per day.



const requestOptions = {
  method: "GET",
  redirect: "follow"
};

try {
  const response = await fetch("https://google.serper.dev/search?q=queen+site%3Awikidata.org&num=20&apiKey=ff902f16d68d09bd36baf224c398fb91fbbdec7c", requestOptions);
  const result = await response.text();
  console.log(result)
} catch (error) {
  console.error(error);
};