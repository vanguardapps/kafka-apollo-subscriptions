define("index", ["require", "exports", "@apollo/server", "@graphql-tools/schema", "@apollo/server/express4", "@apollo/server/plugin/drainHttpServer", "graphql-kafka-subscriptions", "ws", "graphql-ws/lib/use/ws", "express", "http", "cors", "body-parser", "helmet"], function (require, exports, server_1, schema_1, express4_1, drainHttpServer_1, graphql_kafka_subscriptions_1, ws_1, ws_2, express_1, http_1, cors_1, body_parser_1, helmet_1) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    (async () => {
        const pubsub = new graphql_kafka_subscriptions_1.KafkaPubSub({
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
        const app = (0, express_1.default)();
        const httpServer = http_1.default.createServer(app);
        // create websocket server
        const wsServer = new ws_1.WebSocketServer({
            server: httpServer,
            path: "/graphql",
        });
        const schema = (0, schema_1.makeExecutableSchema)({ typeDefs, resolvers });
        const serverCleanup = (0, ws_2.useServer)({ schema }, wsServer);
        const server = new server_1.ApolloServer({
            schema,
            plugins: [
                (0, drainHttpServer_1.ApolloServerPluginDrainHttpServer)({ httpServer }),
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
        app.use((0, cors_1.default)(), body_parser_1.default.json(), // add bodyParser.text() or bodyParser.urlencoded() here as necessary
        (0, express4_1.expressMiddleware)(server), (0, helmet_1.default)());
        httpServer.listen({ port: 4000 }, () => {
            console.log("@apollo/server running on port 4000");
        });
    })();
});
