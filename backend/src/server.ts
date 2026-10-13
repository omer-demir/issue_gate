import { createApp } from "./app";
import { loadConfig } from "./config";
import { InMemoryDocumentStore } from "./store/inMemoryStore";

const config = loadConfig();
const store = new InMemoryDocumentStore();
const app = createApp(config, store);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`issue_gate backend listening on :${port}`);
});
