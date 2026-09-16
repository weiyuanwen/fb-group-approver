import 'dotenv/config';
import { inspectMemberProfile } from './inspect-member.js';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node src/inspect-profile.js <url>');
  process.exit(1);
}

const result = await inspectMemberProfile({ url: input, capture: true });
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
