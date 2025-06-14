// thanks https://chatgpt.com/c/6848beb1-a9b4-800c-a335-0dcc3fd8f0bf

// ~600ms to grab
// {
//   "title": "Sono Bisque Doll wa Koi wo Suru",
//   "description": "High school student Wakana Gojou spends his days perfecting the art of making hina dolls, hoping to eventually reach his grandfather's level of expertise. While his fellow teenagers busy themselves with pop culture, Gojou finds bliss in sewing clothes for his dolls. Nonetheless, he goes to great lengths to keep his unique hobby a secret, as he believes that he would be ridiculed were it revealed. Enter Marin Kitagawa, an extraordinarily pretty girl whose confidence and poise are in stark contrast to Gojou's meekness. It would defy common sense for the friendless Gojou to mix with the likes of Kitagawa, who is always surrounded by her peers. However, the unimaginable happens when Kitagawa discovers Gojou's prowess with a sewing machine and brightly confesses to him about her own hobby: cosplay. Because her sewing skills are pitiable, she decides to enlist his help. As Gojou and Kitagawa work together on one cosplay outfit after another, they cannot help but grow close—even though their lives are worlds apart. [Written by MAL Rewrite] ",
//   "site": "MyAnimeList.net"
// }
// so possibly useful for ranking search results for everything with some id 48736
// there is also keywords and canonical url in the response so might be able to subsequently hit the actual p8966 url match pattern

// ------------ tiny link-preview helper (≈20 lines) --------------------
const CORS_PROXY = 'https://ueue-cors-proxy.7ur.workers.dev/';       // <-- change me

async function quickPreview(rawUrl) {
  const proxied = CORS_PROXY + rawUrl;

  // fetch just the first 32 KB; many proxies support Range requests
  const resp  = await fetch(proxied, { headers: { Range: 'bytes=0-32767' } });
  const html  = await resp.text();
  const head  = html.split('</head>', 1)[0] + '</head>'; // ignore body

  const $     = new DOMParser().parseFromString(head, 'text/html');
  const attr  = (sel, a='content') => $.querySelector(sel)?.getAttribute(a) || '';

  const title = attr('meta[property="og:title"]')
             || attr('title', 'textContent')
             || '';

  const desc  = attr('meta[property="og:description"]')
             || attr('meta[name="description"]')
             || '';

  const site  = attr('meta[property="og:site_name"]')
             || new URL(rawUrl).hostname;

  return { title, description: desc, site };
}

/* ---- demo ---- */
quickPreview('myanimelist.net/anime.php?id=48736')
  .then(console.log)
  .catch(console.error);
