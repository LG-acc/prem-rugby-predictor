import { roundConfig } from '../lib/round-config.js';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end('Method not allowed');
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json(roundConfig);
}
