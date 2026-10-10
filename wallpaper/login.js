// npm run wallpaper:login: signs the wallpaper in to Spotify (PKCE, like the app) and saves the login
// for `npm run wallpaper` to bake in. Wallpaper Engine can't do this itself: a wallpaper has no
// address Spotify could redirect back to.
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { SCOPES } from '../src/spotify.js';

const cid = process.env.VITE_SPOTIFY_CLIENT_ID;
if (!cid) throw new Error('Set VITE_SPOTIFY_CLIENT_ID in .env.local first (see .env.example)');
const redirect_uri = 'http://127.0.0.1:5173/'; // the app's own redirect URI, so the Spotify app needs no changes
const verifier = randomBytes(64).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');

createServer(async (req, res) => {
  const q = new URL(req.url, redirect_uri).searchParams;
  if (!q.has('code')) return res.end(q.get('error') || '');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    body: new URLSearchParams({ client_id: cid, grant_type: 'authorization_code', code: q.get('code'), redirect_uri, code_verifier: verifier }),
  });
  if (!r.ok) return res.end(`Spotify said no (${r.status}). Run it again.`);
  // expires: 0 makes the wallpaper refresh on first use; it keeps its own token from there on
  writeFileSync('.spotify-login.json', JSON.stringify({ refresh: (await r.json()).refresh_token, expires: 0, cid }));
  res.end('Signed in. Now run: npm run wallpaper', () => process.exit());
}).listen(5173, '127.0.0.1');

console.log(`Open this to sign in:\n\nhttps://accounts.spotify.com/authorize?${new URLSearchParams({ client_id: cid, response_type: 'code', redirect_uri, code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES })}\n`);
