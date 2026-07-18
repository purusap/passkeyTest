import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
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

function getCookieOptions(req) {
  return {
    httpOnly: true,
    secure: getOrigin(req).startsWith('https'),
    sameSite: 'lax',
  };
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Stateless Database and Session Signing Helpers
const SECRET = process.env.SESSION_SECRET || 'passkey-usability-study-secret-key-12345';

function signData(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload);
  const signature = hmac.digest('base64url');
  return `${payload}.${signature}`;
}

function verifyData(token) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload);
  const expectedSignature = hmac.digest('base64url');
  if (signature !== expectedSignature) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch (e) {
    return null;
  }
}

// Parse database from token
function getDatabase(dbToken) {
  const data = verifyData(dbToken);
  return data && data.users ? data.users : [];
}

// Simple cookie getter helper
function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [key, val] = cookie.trim().split('=');
    if (key === name) {
      return decodeURIComponent(val);
    }
  }
  return null;
}

/**
 * Endpoint: Get current session status
 */
app.get('/api/me', (req, res) => {
  const loggedInUserVal = getCookie(req, 'loggedInUser');
  const loggedInUserSession = verifyData(loggedInUserVal);
  if (!loggedInUserSession) {
    return res.json({ loggedIn: false });
  }

  const username = loggedInUserSession.username;
  const dbToken = req.query.dbToken;
  const dbUsers = getDatabase(dbToken);
  const user = dbUsers.find((u) => u.username === username);
  if (!user) {
    res.clearCookie('loggedInUser', getCookieOptions(req));
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
  const { username, dbToken } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const dbUsers = getDatabase(dbToken);
  // Check if user already exists in client database
  const existingUser = dbUsers.find((u) => u.username === username);
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

    // Store challenge and username in signed cookie
    const regSessionToken = signData({
      challenge: options.challenge,
      registeringUser: {
        id: userID,
        username: username,
      }
    });
    res.cookie('reg_session', regSessionToken, {
      ...getCookieOptions(req),
      maxAge: 5 * 60 * 1000 // 5 minutes
    });

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
  const { response, mock, dbToken } = req.body;
  const regSessionVal = getCookie(req, 'reg_session');
  const regSession = verifyData(regSessionVal);

  if (!regSession) {
    return res.status(400).json({ error: 'Registration session expired or missing' });
  }

  const { challenge: currentChallenge, registeringUser } = regSession;
  const dbUsers = getDatabase(dbToken);

  if (mock === true) {
    const mockCredId = 'mock-cred-' + Math.random().toString(36).substring(2, 11);
    let user = dbUsers.find((u) => u.username === registeringUser.username);
    if (!user) {
      user = {
        id: registeringUser.id,
        username: registeringUser.username,
        credentials: [],
      };
      dbUsers.push(user);
    }
    user.credentials.push({
      credentialID: mockCredId,
      credentialPublicKey: 'mock-public-key-material-for-' + registeringUser.username,
      counter: 0,
      transports: ['internal'],
      createdAt: new Date().toISOString(),
    });

    res.clearCookie('reg_session', getCookieOptions(req));

    // Create session cookie
    const loggedInUserToken = signData({ username: user.username });
    res.cookie('loggedInUser', loggedInUserToken, {
      ...getCookieOptions(req),
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    const newDbToken = signData({ users: dbUsers });
    return res.json({ verified: true, mock: true, dbToken: newDbToken });
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
      let user = dbUsers.find((u) => u.username === registeringUser.username);
      if (!user) {
        user = {
          id: registeringUser.id,
          username: registeringUser.username,
          credentials: [],
        };
        dbUsers.push(user);
      }

      // Store device key details
      user.credentials.push({
        credentialID: Buffer.from(credentialID).toString('base64url'),
        credentialPublicKey: Buffer.from(credentialPublicKey).toString('base64url'),
        counter,
        transports: response.transports || [],
        createdAt: new Date().toISOString(),
      });

      res.clearCookie('reg_session', getCookieOptions(req));

      // Create session cookie
      const loggedInUserToken = signData({ username: user.username });
      res.cookie('loggedInUser', loggedInUserToken, {
        ...getCookieOptions(req),
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      const newDbToken = signData({ users: dbUsers });
      res.json({ verified: true, dbToken: newDbToken });
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
  const { username, dbToken } = req.body;
  const dbUsers = getDatabase(dbToken);

  let allowCredentials = [];

  // If a username is provided, restrict to their registered keys.
  // Otherwise, we allow discoverable credentials (login without username upfront).
  if (username) {
    const user = dbUsers.find((u) => u.username === username);
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

    // Save authentication challenge in signed cookie
    const loginSessionToken = signData({
      challenge: options.challenge
    });
    res.cookie('login_session', loginSessionToken, {
      ...getCookieOptions(req),
      maxAge: 5 * 60 * 1000 // 5 minutes
    });

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
  const { response, mock, dbToken } = req.body;
  const loginSessionVal = getCookie(req, 'login_session');
  const loginSession = verifyData(loginSessionVal);

  if (!loginSession) {
    return res.status(400).json({ error: 'Authentication session expired or missing' });
  }

  const currentChallenge = loginSession.challenge;
  const dbUsers = getDatabase(dbToken);

  if (mock === true) {
    let foundUser = null;
    let foundCred = null;

    for (const user of dbUsers) {
      const cred = user.credentials.find((c) => {
        try {
          return Buffer.from(c.credentialID, 'base64url').equals(Buffer.from(response.id, 'base64url'));
        } catch (e) {
          return false;
        }
      });
      if (cred) {
        foundUser = user;
        foundCred = cred;
        break;
      }
    }

    if (!foundUser && dbUsers.length > 0) {
      foundUser = dbUsers[0];
      foundCred = foundUser.credentials[0];
    }

    if (foundUser) {
      res.clearCookie('login_session', getCookieOptions(req));

      const loggedInUserToken = signData({ username: foundUser.username });
      res.cookie('loggedInUser', loggedInUserToken, {
        ...getCookieOptions(req),
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      return res.json({ verified: true, mock: true });
    } else {
      return res.status(400).json({ error: 'No registered mock users found in database. Please sign up first!' });
    }
  }

  try {
    // Find who this credential belongs to
    let foundUser = null;
    let foundCred = null;

    console.log('[DEBUG] Login verify response.id:', response.id);
    for (const user of dbUsers) {
      console.log('[DEBUG] User:', user.username, 'credentials:', user.credentials.map(c => c.credentialID));
      const cred = user.credentials.find((c) => {
        try {
          return Buffer.from(c.credentialID, 'base64url').equals(Buffer.from(response.id, 'base64url'));
        } catch (e) {
          return false;
        }
      });
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

      res.clearCookie('login_session', getCookieOptions(req));

      const loggedInUserToken = signData({ username: foundUser.username });
      res.cookie('loggedInUser', loggedInUserToken, {
        ...getCookieOptions(req),
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });

      const newDbToken = signData({ users: dbUsers });
      res.json({ verified: true, dbToken: newDbToken });
    } else {
      res.status(400).json({ error: 'Authentication verification failed' });
    }
  } catch (error) {
    console.error('Error verifying authentication:', error);
    res.status(500).json({ error: 'Authentication verification crashed' });
  }
});

/**
 * Endpoint: Logout
 */
app.post('/api/logout', (req, res) => {
  res.clearCookie('loggedInUser', getCookieOptions(req));
  res.json({ success: true });
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
