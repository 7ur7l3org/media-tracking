// thanks https://chatgpt.com/c/6848beb1-a9b4-800c-a335-0dcc3fd8f0bf
// https://serper.dev/playground

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