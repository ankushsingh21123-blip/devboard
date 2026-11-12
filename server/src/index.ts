import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { connectDb } from './db.js';
import { resolvers } from './resolvers.js';
import { typeDefs } from './schema.js';

export function createApolloServer() {
  return new ApolloServer({ typeDefs, resolvers });
}

export async function createApp() {
  const server = createApolloServer();
  await server.start();
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/graphql', expressMiddleware(server));
  return app;
}

const PORT = Number(process.env.PORT ?? 4000);
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/devboard';

if (import.meta.url === `file://${process.argv[1]}`) {
  connectDb(MONGODB_URI)
    .then(() => createApp())
    .then((app) => {
      app.listen(PORT, () => {
        console.log(`DevBoard API ready at http://localhost:${PORT}/graphql`);
      });
    })
    .catch((err) => {
      console.error('Failed to start server:', err);
      process.exit(1);
    });
}
