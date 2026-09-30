const mongoose = require("mongoose");

// How long the driver keeps looking for a reachable MongoDB server before the
// initial connection attempt fails (instead of hanging for the 30s default).
const SERVER_SELECTION_TIMEOUT_MS = 10000;

/** Turns a raw connection error into an actionable hint for the console. */
const getConnectionHint = (message = "") => {
  if (/ECONNREFUSED/i.test(message)) {
    return (
      "MongoDB refused the connection. Make sure the mongod service is running. " +
      "If MONGO_URI uses 'localhost', try 127.0.0.1 instead (localhost can resolve to IPv6 ::1)."
    );
  }
  if (/auth/i.test(message)) {
    return "Authentication failed. Check the username/password in MONGO_URI (URL-encode special characters).";
  }
  if (/ENOTFOUND|querySrv|EAI_AGAIN/i.test(message)) {
    return "The MongoDB host name could not be resolved. Check the host in MONGO_URI and your internet connection.";
  }
  if (/Server selection timed out|ReplicaSetNoPrimary/i.test(message)) {
    return "No MongoDB server responded in time. For Atlas, make sure your IP is allow-listed under Network Access.";
  }
  if (/Invalid scheme|Invalid connection string/i.test(message)) {
    return "MONGO_URI is not a valid MongoDB connection string (it must start with mongodb:// or mongodb+srv://).";
  }
  return null;
};

/**
 * Connects to MongoDB using the connection string in MONGO_URI.
 *
 * The server only starts listening AFTER this resolves, so no request can hit
 * a model before the database is connected. If the initial connection fails
 * the process exits with a clear message (the API is useless without a DB).
 * If the connection is lost later, the connection events below log it, and the
 * requireDatabase middleware answers 503 immediately instead of letting
 * Mongoose buffer the query for 10s and fail with "buffering timed out".
 */
const connectDB = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error(
      "MONGO_URI is not set. Add it to your .env file before starting the server."
    );
    process.exit(1);
  }

  mongoose.connection.on("disconnected", () =>
    console.warn("MongoDB disconnected. API requests return 503 until it reconnects.")
  );
  mongoose.connection.on("reconnected", () => console.log("MongoDB reconnected."));
  mongoose.connection.on("error", (err) =>
    console.error(`MongoDB connection error: ${err.message}`)
  );

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    });
    console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    const hint = getConnectionHint(error.message);
    if (hint) console.error(`Hint: ${hint}`);
    process.exit(1);
  }
};

module.exports = connectDB;
