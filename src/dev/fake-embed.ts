import { fakeEmbed } from "../embeddings/fake.js";

if (import.meta.url === `file://${process.argv[1]}`) {
  const text = process.argv.slice(2).join(" ").trim();
  if (!text) {
    console.error('Usage: npm run fake-embed -- "some text"');
    process.exit(2);
  }
  process.stdout.write(JSON.stringify(fakeEmbed(text)));
}
