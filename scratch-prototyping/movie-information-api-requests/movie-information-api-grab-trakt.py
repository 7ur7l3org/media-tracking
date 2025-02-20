
from urllib.request import Request, urlopen

with open('movie-information-api-key-trakt.txt', 'r') as file:
    api_key = file.read().strip()

headers = {
  'Content-Type': 'application/json',
  'trakt-api-version': '2',
  'trakt-api-key': api_key
}
id = "the-werewolf-game-inferno-2018"
request = Request(f'https://api.trakt.tv/movies/{id}?extended=full', headers=headers)

response_body = urlopen(request).read()
print(response_body)
