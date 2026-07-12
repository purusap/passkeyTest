import express from 'express';
import session from 'express-session';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const RP_NAME = 'Passkey Usability Study Lab';

// Dynamic host/origin helpers for WebAuthn (required for Vercel/serverless environments)
function getRPID(req) {
  return req.hostname;
}

function getOrigin(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  return `${protocol}://${req.get('host')}`;
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure sessions to store WebAuthn challenges
app.use(
  session({
    secret: 'passkey-usability-study-secret-key-12345',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: false, // Set to true if using HTTPS, false for localhost HTTP
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);



// In-Memory Database (for testing / demo purposes)
const users = new Map(); // username -> user object
const feedbackFile = path.join(__dirname, 'feedback.json');

// Initialize feedback file if it doesn't exist
if (!fs.existsSync(feedbackFile)) {
  fs.writeFileSync(feedbackFile, JSON.stringify([], null, 2), 'utf-8');
}

// Utility to read/write feedback
function getFeedback() {
  try {
    const data = fs.readFileSync(feedbackFile, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

function saveFeedback(newFeedback) {
  try {
    const feed = getFeedback();
    feed.push({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      ...newFeedback,
    });
    fs.writeFileSync(feedbackFile, JSON.stringify(feed, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving feedback:', err);
  }
}

/**
 * Endpoint: Get current session status
 */
app.get('/api/me', (req, res) => {
  if (!req.session.loggedInUser) {
    return res.json({ loggedIn: false });
  }

  const user = users.get(req.session.loggedInUser);
  if (!user) {
    req.session.destroy();
    return res.json({ loggedIn: false });
  }

  // Return non-sensitive metadata for dashboard display
  res.json({
    loggedIn: true,
    user: {
      username: user.username,
      id: user.id,
      credentialsCount: user.credentials.length,
      credentials: user.credentials.map((c) => ({
        credentialID: c.credentialID,
        counter: c.counter,
        transports: c.transports,
        createdAt: c.createdAt,
      })),
    },
  });
});

/**
 * Endpoint: Register options generation
 */
app.post('/api/register/options', async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  // Check if user already exists
  const existingUser = users.get(username);
  const userDevices = existingUser ? existingUser.credentials : [];

  // Generate unique User ID if it's a new user
  const userID = existingUser ? existingUser.id : crypto.randomUUID();

  try {
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: getRPID(req),
      userID: new TextEncoder().encode(userID),
      userName: username,
      userDisplayName: username,
      attestationType: 'none',
      excludeCredentials: userDevices.map((dev) => ({
        id: dev.credentialID,
        type: 'public-key',
        transports: dev.transports,
      })),
      authenticatorSelection: {
        residentKey: 'required', // Required for passkey support
        userVerification: 'preferred', // Triggers biometrics/PIN if available
      },
    });

    // Save challenge and username in session
    req.session.currentChallenge = options.challenge;
    req.session.registeringUser = {
      id: userID,
      username: username,
    };

    res.json(options);
  } catch (error) {
    console.error('Error generating registration options:', error);
    res.status(500).json({ error: 'Failed to generate registration options' });
  }
});

/**
 * Endpoint: Register response verification
 */
app.post('/api/register/verify', async (req, res) => {
  const { response, mock } = req.body;
  const { currentChallenge, registeringUser } = req.session;

  if (!currentChallenge || !registeringUser) {
    return res.status(400).json({ error: 'Registration session expired or missing' });
  }

  if (mock === true) {
    const mockCredId = 'mock-cred-' + Math.random().toString(36).substring(2, 11);
    let user = users.get(registeringUser.username);
    if (!user) {
      user = {
        id: registeringUser.id,
        username: registeringUser.username,
        credentials: [],
      };
      users.set(registeringUser.username, user);
    }
    user.credentials.push({
      credentialID: mockCredId,
      credentialPublicKey: 'mock-public-key-material-for-' + registeringUser.username,
      counter: 0,
      transports: ['internal'],
      createdAt: new Date().toISOString(),
    });

    req.session.currentChallenge = null;
    req.session.registeringUser = null;
    req.session.loggedInUser = user.username;

    return res.json({ verified: true, mock: true });
  }

  try {
    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: currentChallenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRPID(req),
    });

    const { verified, registrationInfo } = verification;

    if (verified && registrationInfo) {
      const { credentialPublicKey, credentialID, counter } = registrationInfo;

      // Find or create user
      let user = users.get(registeringUser.username);
      if (!user) {
        user = {
          id: registeringUser.id,
          username: registeringUser.username,
          credentials: [],
        };
        users.set(registeringUser.username, user);
      }

      // Store device key details
      user.credentials.push({
        credentialID: Buffer.from(credentialID).toString('base64url'),
        credentialPublicKey: Buffer.from(credentialPublicKey).toString('base64url'),
        counter,
        transports: response.transports || [],
        createdAt: new Date().toISOString(),
      });

      // Clear registration details, mark user as logged in
      req.session.currentChallenge = null;
      req.session.registeringUser = null;
      req.session.loggedInUser = user.username;

      res.json({ verified: true });
    } else {
      res.status(400).json({ error: 'Registration verification failed' });
    }
  } catch (error) {
    console.error('Error verifying registration:', error);
    res.status(500).json({ error: 'Registration verification crashed' });
  }
});

/**
 * Endpoint: Login options generation
 */
app.post('/api/login/options', async (req, res) => {
  const { username } = req.body;

  let allowCredentials = [];

  // If a username is provided, restrict to their registered keys.
  // Otherwise, we allow discoverable credentials (login without username upfront).
  if (username) {
    const user = users.get(username);
    if (!user) {
      return res.status(400).json({ error: `User "${username}" does not exist.` });
    }
    allowCredentials = user.credentials.map((dev) => ({
      id: dev.credentialID,
      type: 'public-key',
      transports: dev.transports,
    }));
  }

  try {
    const options = await generateAuthenticationOptions({
      rpID: getRPID(req),
      allowCredentials,
      userVerification: 'preferred',
    });

    // Save authentication challenge in session
    req.session.currentChallenge = options.challenge;

    res.json(options);
  } catch (error) {
    console.error('Error generating authentication options:', error);
    res.status(500).json({ error: 'Failed to generate authentication options' });
  }
});

/**
 * Endpoint: Login response verification
 */
app.post('/api/login/verify', async (req, res) => {
  const { response, mock } = req.body;
  const { currentChallenge } = req.session;

  if (!currentChallenge) {
    return res.status(400).json({ error: 'Authentication session expired or missing' });
  }

  if (mock === true) {
    let foundUser = null;
    let foundCred = null;

    for (const [username, user] of users.entries()) {
      const cred = user.credentials.find((c) => c.credentialID === response.id);
      if (cred) {
        foundUser = user;
        foundCred = cred;
        break;
      }
    }

    if (!foundUser && users.size > 0) {
      foundUser = users.values().next().value;
      foundCred = foundUser.credentials[0];
    }

    if (foundUser) {
      req.session.currentChallenge = null;
      req.session.loggedInUser = foundUser.username;
      return res.json({ verified: true, mock: true });
    } else {
      return res.status(400).json({ error: 'No registered mock users found in database. Please sign up first!' });
    }
  }

  try {
    // Find who this credential belongs to
    let foundUser = null;
    let foundCred = null;

    for (const [username, user] of users.entries()) {
      const cred = user.credentials.find((c) => c.credentialID === response.id);
      if (cred) {
        foundUser = user;
        foundCred = cred;
        break;
      }
    }

    if (!foundUser || !foundCred) {
      return res.status(400).json({ error: 'Credential not recognized. Has it been registered?' });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: currentChallenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRPID(req),
      credential: {
        id: foundCred.credentialID,
        publicKey: Buffer.from(foundCred.credentialPublicKey, 'base64url'),
        counter: foundCred.counter,
        transports: foundCred.transports,
      },
    });

    const { verified, authenticationInfo } = verification;

    if (verified && authenticationInfo) {
      // Update signature counter
      foundCred.counter = authenticationInfo.newCounter;

      // Mark user as logged in
      req.session.currentChallenge = null;
      req.session.loggedInUser = foundUser.username;

      res.json({ verified: true });
    } else {
      res.status(400).json({ error: 'Authentication verification failed' });
    }
  } catch (error) {
    console.error('Error verifying authentication:', error);
    res.status(500).json({ error: 'Authentication verification crashed' });
  }
});

/**
 * Endpoint: Usability Feedback survey submission
 */
app.post('/api/feedback', (req, res) => {
  const { ratingEase, ratingSecurity, ratingTrust, feedbackText } = req.body;

  if (!ratingEase || !ratingSecurity || !ratingTrust) {
    return res.status(400).json({ error: 'All rating fields are required.' });
  }

  const username = req.session.loggedInUser || 'anonymous';
  const survey = {
    username,
    ratingEase: parseInt(ratingEase, 10),
    ratingSecurity: parseInt(ratingSecurity, 10),
    ratingTrust: parseInt(ratingTrust, 10),
    feedbackText: feedbackText || '',
  };

  saveFeedback(survey);
  res.json({ success: true, message: 'Feedback saved successfully.' });
});

/**
 * Endpoint: Logout
 */
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Start server if not running in a Serverless environment (like Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`  PASSKEY USABILITY STUDY SERVER RUNNING          `);
    console.log(`  Access the lab: http://localhost:${PORT}        `);
    console.log(`==================================================`);
  });
}

export default app;
