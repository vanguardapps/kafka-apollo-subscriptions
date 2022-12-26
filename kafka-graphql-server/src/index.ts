import { ApolloServer } from "@apollo/server";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { KafkaPubSub } from "graphql-kafka-subscriptions";
import { WebSocketServer } from "ws";
import { useServer } from "graphql-ws/lib/use/ws";
import express from "express";
import http from "http";
import cors from "cors";
import bodyParser from "body-parser";
import helmet from "helmet";

(async () => {
  const pubsub = new KafkaPubSub({
    topic: "RoyMessages",
    host: "127.0.0.1",
    port: "9092",
    globalConfig: {}, // options passed directly to the consumer and producer
  });

  // graphql schema
  const typeDefs = `#graphql
    type Query {
      viewMessages: [Message!]
    }
    type Mutation {
      sendMessage(name: String, content: String): Message!
    }
    type Subscription {
      receiveMessage: Message!
    }
    type Message {
      id: ID!
      name: String!
      content: String
    }
  `;

  let messages = [];

  // graphql resolvers
  const resolvers = {
    Query: {
      viewMessages() {
        return messages;
      },
    },
    Mutation: {
      sendMessage: (parent, { name, content }) => {
        const id = messages.length;
        var new_message = {
          id,
          name,
          content,
        };
        messages.push(new_message);
        pubsub.publish("RoyMessages", { receiveMessage: new_message });
        return new_message;
      },
    },
    Subscription: {
      receiveMessage: {
        subscribe: () => pubsub.asyncIterator(["RoyMessages"]),
      },
    },
  };

  // set up express server so we can serve middleware
  const app = express();
  const httpServer = http.createServer(app);

  // create websocket server
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: "/graphql",
  });

  const schema = makeExecutableSchema({ typeDefs, resolvers });

  const serverCleanup = useServer({ schema }, wsServer);

  const server = new ApolloServer({
    schema,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      // Proper shutdown for the WebSocket server.
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await serverCleanup.dispose();
            },
          };
        },
      },
    ],
  });

  await server.start();

  app.use(
    cors(),
    bodyParser.json(), // add bodyParser.text() or bodyParser.urlencoded() here as necessary
    expressMiddleware(server),
    helmet()
  );

  httpServer.listen({ port: 4000 }, () => {
    console.log("@apollo/server running on port 4000");
  });
})();
