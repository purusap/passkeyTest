// Frontend Logic for Passkey Usability Study

// Panel Modes: Guide vs. Developer
const btnUserMode = document.getElementById('btnUserMode');
const btnDevMode = document.getElementById('btnDevMode');
const userGuideArea = document.getElementById('userGuideArea');
const devConsoleArea = document.getElementById('devConsoleArea');

btnUserMode.addEventListener('click', () => {
  btnUserMode.classList.add('active');
  btnDevMode.classList.remove('active');
  userGuideArea.classList.remove('hidden');
  devConsoleArea.classList.add('hidden');
});

btnDevMode.addEventListener('click', () => {
  btnDevMode.classList.add('active');
  btnUserMode.classList.remove('active');
  devConsoleArea.classList.remove('hidden');
  userGuideArea.classList.add('hidden');
});

// Tab Navigation Logic (Inside Dev Console)
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    tabButtons.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const tabId = btn.getAttribute('data-tab');
    document.getElementById(tabId).classList.add('active');
  });
});

// Dynamic Participant Guide Steps Dictionary
const guideSteps = {
  idle: {
    title: "Ready to Test",
    text: "Enter a username on the left and click <strong>Register Passkey</strong> (or toggle <strong>Demo Mode</strong> to simulate it) to see a step-by-step explanation of how authentication occurs!",
    insights: [
      "<strong>No Passwords:</strong> You don't need to create or remember complex characters. Passkeys are stored directly on your device.",
      "<strong>Biometric Privacy:</strong> Your fingerprint, face scan, or PIN is processed locally on your device. The website and server never see it.",
      "<strong>Phishing Protection:</strong> Passkeys are cryptographically locked to this specific domain (localhost), protecting you from fake websites."
    ]
  },
  options_req_register: {
    title: "1. Handshake: Requesting Registration Parameters",
    text: "The browser requests FIDO2 registration options from the server (e.g. relying party ID, user ID, cryptographic challenge).",
    insights: [
      "<strong>Unique Challenge:</strong> The server sends a random challenge to ensure the client response cannot be copied and replayed by hackers.",
      "<strong>Excluding Re-registration:</strong> It checks if the current device has already registered a key to prevent duplicating credentials."
    ]
  },
  options_req_login: {
    title: "1. Handshake: Requesting Login Parameters",
    text: "The browser requests verification credentials options from the server to initialize the login.",
    insights: [
      "<strong>Discoverable Keys:</strong> Passkeys support username-less login! The browser can search your device's storage for the matching credential without requiring your username upfront.",
      "<strong>Anti-Replay Challenge:</strong> Just like registration, the server provides a random challenge that must be signed locally."
    ]
  },
  authenticator_prompt: {
    title: "2. Secure Local Authentication Prompt",
    text: "Your browser triggers the operating system's WebAuthn prompt (e.g. Windows Hello, TouchID/FaceID, or a USB security key).",
    insights: [
      "<strong>🔒 Biometric Privacy:</strong> Your fingerprint scan or face pattern is processed strictly inside your device's local hardware enclave. The website and server never see your biometric data.",
      "<strong>User Verification:</strong> This local lock screen check unlocks the secure hardware chip to perform key signing."
    ]
  },
  authenticator_done: {
    title: "3. Cryptographic Signature Generation",
    text: "Your device generates a unique keypair (Public and Private keys) and signs the challenge payload.",
    insights: [
      "<strong>Private Key (Hidden):</strong> The private key is securely stored in your device's security chip and never shared with the internet.",
      "<strong>Public Key (Shared):</strong> The public key is prepared to be uploaded. The server will use it to verify your future login signatures.",
      "<strong>Signature:</strong> Your device uses its private key to sign the challenge, proving you approved the action locally."
    ]
  },
  verify_req: {
    title: "4. Submitting Verification Response",
    text: "The browser packages the signature payload and sends it to the server for verification.",
    insights: [
      "<strong>No Shared Secrets:</strong> The server does not store a password or biometric. It only stores the public key.",
      "<strong>Hacker-Proof Storage:</strong> If the server database is breached, hackers only steal public keys. They cannot authenticate without your physical device."
    ]
  },
  success_register: {
    title: "Registration Successful! 🎉",
    text: "The server verified the signature, stored your public key, and established your secure session.",
    insights: [
      "<strong>Registered Device:</strong> Your passkey is now set up. To log in next time, you will only need a quick touch or scan.",
      "<strong>Try Logging Out:</strong> Try logging out using the button on the left, then test how quick the login process is!"
    ]
  },
  success_login: {
    title: "Login Successful! 🎉",
    text: "The server successfully verified your device's signature against your stored public key. You are logged in.",
    insights: [
      "<strong>One-Touch Access:</strong> You logged in instantly without typing passwords, entering OTPs, or waiting for email codes.",
      "<strong>Maximum Security:</strong> Cryptographic signatures eliminate password reuse risks and completely prevent credentials harvesting."
    ]
  },
  flow_error: {
    title: "Ceremony Cancelled or Failed ❌",
    text: "The passkey operation was cancelled by the user, timed out, or rejected by the server.",
    insights: [
      "<strong>User Cancellation:</strong> Tapping outside or hitting 'Cancel' on the system pop-up stops the flow.",
      "<strong>Re-try:</strong> You can try again at any time by clicking the signup or login buttons."
    ]
  }
};

function updateParticipantGuide(step) {
  const data = guideSteps[step] || guideSteps.idle;
  document.getElementById('guideStepTitle').textContent = data.title;
  document.getElementById('guideStepText').innerHTML = data.text;

  const list = document.getElementById('guideStepInsights');
  list.innerHTML = '';
  data.insights.forEach(ins => {
    const li = document.createElement('li');
    li.innerHTML = ins;
    list.appendChild(li);
  });
}


// JSON Syntax Highlighting Utility
function syntaxHighlight(json) {
  if (typeof json !== 'string') {
    json = JSON.stringify(json, undefined, 2);
  }
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, function (match) {
    let cls = 'number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) {
        cls = 'key';
      } else {
        cls = 'string';
      }
    } else if (/true|false/.test(match)) {
      cls = 'boolean';
    } else if (/null/.test(match)) {
      cls = 'null';
    }
    return '<span class="json-' + cls + '">' + match + '</span>';
  });
}

// Log formatting helper
function logToTab(tabId, data) {
  const codeElem = document.getElementById(tabId);
  if (codeElem) {
    codeElem.innerHTML = syntaxHighlight(data);
  }
}

// Clear Dev Console
document.getElementById('btnClearConsole').addEventListener('click', () => {
  logToTab('jsonOptions', '// Awaiting registration or authentication...');
  logToTab('jsonResponse', '// Awaiting credentials callback...');
  logToTab('jsonVerification', '// Awaiting verification result...');
  setConsoleIndicator('IDLE');
  resetFlowNodes();
  updateParticipantGuide('idle');
});

function setConsoleIndicator(text, isActive = false) {
  const indicator = document.getElementById('consoleStatus');
  indicator.textContent = text;
  if (isActive) {
    indicator.classList.add('active-log');
  } else {
    indicator.classList.remove('active-log');
  }
}

// Interactive Flow Diagram Nodes & Signals
const nodeBrowser = document.getElementById('nodeBrowser');
const nodeAuthenticator = document.getElementById('nodeAuthenticator');
const nodeServer = document.getElementById('nodeServer');
const signal1 = document.getElementById('signal1');
const signal2 = document.getElementById('signal2');
const flowStateDesc = document.getElementById('flowStateDesc');

function resetFlowNodes() {
  nodeBrowser.className = 'node';
  nodeAuthenticator.className = 'node';
  nodeServer.className = 'node';
  signal1.className = 'flow-signal';
  signal2.className = 'flow-signal';
  flowStateDesc.innerHTML = '<strong>Idle State</strong>: Ready to start a Passkey registration or login ceremony.';
}

/**
 * Updates the Visual Flow Diagram
 * @param {string} step - The active WebAuthn step identifier
 */
function updateFlowDiagram(step) {
  resetFlowNodes();

  switch (step) {
    case 'options_req_register':
      nodeBrowser.classList.add('active');
      signal2.classList.add('signal-backward'); // server -> browser
      flowStateDesc.innerHTML = '<strong>1. Request Options</strong>: Browser contacts server for registration configurations, cryptographic challenge, and RP identity.';
      break;

    case 'options_req_login':
      nodeBrowser.classList.add('active');
      signal2.classList.add('signal-backward'); // server -> browser
      flowStateDesc.innerHTML = '<strong>1. Request Options</strong>: Browser requests login assertion options and challenge parameters from the server.';
      break;

    case 'authenticator_prompt':
      nodeBrowser.classList.add('active');
      nodeAuthenticator.classList.add('active');
      signal1.classList.add('signal-forward'); // browser -> authenticator
      flowStateDesc.innerHTML = '<strong>2. Prompting Authenticator</strong>: Browser initiates <code>navigator.credentials</code>. Authenticator opens system dialog for biometric verification (Hello, FaceID) or PIN.';
      break;

    case 'authenticator_done':
      nodeBrowser.classList.add('active');
      nodeAuthenticator.classList.add('active');
      signal1.classList.add('signal-backward'); // authenticator -> browser
      flowStateDesc.innerHTML = '<strong>3. Key Pair Generated / Signed</strong>: Authenticator verifies user, creates a credential key pair, signs the challenge, and returns attestation details to the browser.';
      break;

    case 'verify_req':
      nodeBrowser.classList.add('active');
      nodeServer.classList.add('active');
      signal2.classList.add('signal-forward'); // browser -> server
      flowStateDesc.innerHTML = '<strong>4. Submitting Payload</strong>: Browser bundles credential components and sends the signature payload to the server for verification.';
      break;

    case 'success_register':
      nodeBrowser.classList.add('active');
      nodeAuthenticator.classList.add('active');
      nodeServer.classList.add('active');
      flowStateDesc.innerHTML = '<strong>Success 🎉</strong>: Server verified the client signature against the public key and registered the new Passkey device!';
      break;

    case 'success_login':
      nodeBrowser.classList.add('active');
      nodeAuthenticator.classList.add('active');
      nodeServer.classList.add('active');
      flowStateDesc.innerHTML = '<strong>Success 🎉</strong>: Server authenticated user signature using the registered public key. Login complete!';
      break;

    case 'flow_error':
      nodeBrowser.classList.add('active');
      flowStateDesc.innerHTML = '<strong style="color: #f43f5e;">Error ❌</strong>: The WebAuthn operation was cancelled or verification failed. Review log trace in console.';
      break;
  }
  updateParticipantGuide(step);
}

// App State Cache
let currentUser = null;

// UI Panels
const authControls = document.getElementById('authControls');
const dashboardArea = document.getElementById('dashboardArea');
const introCard = document.getElementById('introCard');
const welcomeUser = document.getElementById('welcomeUser');
const userIdVal = document.getElementById('userIdVal');
const credentialsListBody = document.getElementById('credentialsListBody');

// Check Current Session on load
async function checkAuthSession() {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();

    if (data.loggedIn) {
      currentUser = data.user;
      renderDashboard();
    } else {
      currentUser = null;
      renderSignedOut();
    }
  } catch (err) {
    console.error('Error fetching session:', err);
  }
}

function renderDashboard() {
  authControls.classList.add('hidden');
  introCard.classList.add('hidden');
  dashboardArea.classList.remove('hidden');

  welcomeUser.textContent = `Welcome back, ${currentUser.username}!`;
  userIdVal.textContent = currentUser.id;

  credentialsListBody.innerHTML = '';
  if (currentUser.credentials.length === 0) {
    credentialsListBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No passkeys registered.</td></tr>';
  } else {
    currentUser.credentials.forEach(cred => {
      const row = document.createElement('tr');
      
      const idCell = document.createElement('td');
      idCell.textContent = cred.credentialID.slice(0, 16) + '...';
      idCell.title = cred.credentialID;
      
      const counterCell = document.createElement('td');
      counterCell.textContent = cred.counter;
      
      const createdCell = document.createElement('td');
      createdCell.textContent = new Date(cred.createdAt).toLocaleDateString() + ' ' + new Date(cred.createdAt).toLocaleTimeString();

      row.appendChild(idCell);
      row.appendChild(counterCell);
      row.appendChild(createdCell);
      credentialsListBody.appendChild(row);
    });
  }
}

function renderSignedOut() {
  authControls.classList.remove('hidden');
  introCard.classList.remove('hidden');
  dashboardArea.classList.add('hidden');
}

// ----------------------------------------------------
// Flow 1: Registration (Signup)
// ----------------------------------------------------
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// ----------------------------------------------------
// Flow 1: Registration (Signup)
// ----------------------------------------------------
const signupForm = document.getElementById('signupForm');
const signupUsername = document.getElementById('signupUsername');

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = signupUsername.value.trim();
  if (!username) return;

  const isDemoMode = document.getElementById('demoModeToggle').checked;

  try {
    // 1. Get options from server
    setConsoleIndicator('REQ_OPTIONS', true);
    updateFlowDiagram('options_req_register');
    
    const optionsRes = await fetch('/api/register/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    
    if (!optionsRes.ok) {
      const errData = await optionsRes.json();
      throw new Error(errData.error || 'Failed to fetch registration options');
    }

    const options = await optionsRes.json();
    logToTab('jsonOptions', options);
    
    // Switch view to options tab
    document.querySelector('[data-tab="tabOptions"]').click();

    // 2. Trigger browser passkey registration (or mock it in Demo Mode)
    updateFlowDiagram('authenticator_prompt');
    setConsoleIndicator('PROMPT_AUTHENTICATOR', true);
    
    let attestationResponse;
    if (isDemoMode) {
      // Simulate biometric authenticator prompt delay
      await delay(1500);
      
      // Generate simulated registration response
      attestationResponse = {
        id: 'mock-cred-' + Math.random().toString(36).substring(2, 11),
        rawId: 'bW9jay1jcmVkLXVpZA',
        type: 'public-key',
        response: {
          clientDataJSON: 'eyJjaGFsbGVuZ2UiOiJtb2NrLWF1dGgtY2hhbGxlbmdlIiwib3JpZ2luIjoiaHR0cDovL2xvY2FsaG9zdDozMDAwIiwidHlwZSI6IndlYmF1dGhuLmNyZWF0ZSJ9',
          attestationObject: 'o2NmbXRkbm9uZWdhdHRTdG1keGNYY2NyZWREYXRhWFlpZGVudGlmaWVy',
          transports: ['internal']
        },
        authenticatorAttachment: 'platform'
      };
    } else {
      try {
        attestationResponse = await SimpleWebAuthnBrowser.startRegistration(options);
      } catch (err) {
        console.error(err);
        throw new Error(`Browser authenticator prompt cancelled/failed: ${err.message}`);
      }
    }

    // 3. Update Response logs
    updateFlowDiagram('authenticator_done');
    logToTab('jsonResponse', attestationResponse);
    document.querySelector('[data-tab="tabResponse"]').click();

    // 4. Send response to server for verification
    setConsoleIndicator('VERIFYING', true);
    updateFlowDiagram('verify_req');
    
    const verifyRes = await fetch('/api/register/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        response: attestationResponse,
        mock: isDemoMode ? true : undefined
      })
    });

    const verifyResult = await verifyRes.json();
    logToTab('jsonVerification', verifyResult);
    document.querySelector('[data-tab="tabVerification"]').click();

    if (verifyResult.verified) {
      setConsoleIndicator('VERIFIED');
      updateFlowDiagram('success_register');
      
      // Update session state
      await checkAuthSession();
    } else {
      throw new Error(verifyResult.error || 'Registration verification failed');
    }

  } catch (err) {
    console.error(err);
    logToTab('jsonVerification', { error: err.message });
    document.querySelector('[data-tab="tabVerification"]').click();
    updateFlowDiagram('flow_error');
    setConsoleIndicator('ERROR');
    alert(err.message);
  }
});

// ----------------------------------------------------
// Flow 2: Authentication (Login)
// ----------------------------------------------------
const loginForm = document.getElementById('loginForm');
const loginUsername = document.getElementById('loginUsername');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = loginUsername.value.trim();
  const isDemoMode = document.getElementById('demoModeToggle').checked;

  try {
    // 1. Get Options
    setConsoleIndicator('REQ_OPTIONS', true);
    updateFlowDiagram('options_req_login');

    const optionsRes = await fetch('/api/login/options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username || undefined }) // username is optional for discoverable keys
    });

    if (!optionsRes.ok) {
      const errData = await optionsRes.json();
      throw new Error(errData.error || 'Failed to fetch login options');
    }

    const options = await optionsRes.json();
    logToTab('jsonOptions', options);
    document.querySelector('[data-tab="tabOptions"]').click();

    // 2. Trigger browser passkey assertion (or mock it in Demo Mode)
    updateFlowDiagram('authenticator_prompt');
    setConsoleIndicator('PROMPT_AUTHENTICATOR', true);

    let assertionResponse;
    if (isDemoMode) {
      // Simulate biometric authenticator prompt delay
      await delay(1500);

      // Generate simulated login verification assertion
      assertionResponse = {
        id: options.allowCredentials?.[0]?.id || 'mock-cred-active',
        rawId: 'bW9jay1hc3NlcnRpb24taWQ',
        type: 'public-key',
        response: {
          authenticatorData: 'SZYN5YgOjGh0NBcP5A-3_92j_d-A6F7D8E9F0A1B2C3D4E5F6G7H8I9J0K',
          clientDataJSON: 'eyJjaGFsbGVuZ2UiOiJtb2NrLWF1dGgtY2hhbGxlbmdlIiwib3JpZ2luIjoiaHR0cDovL2xvY2FsaG9zdDozMDAwIiwidHlwZSI6IndlYmF1dGhuLmdldCJ9',
          signature: 'MEYCIQCc_FqK8uYnJdZ63d0c...mock_signature_data...',
          userHandle: 'dXNlci0xMjM0NTY'
        },
        authenticatorAttachment: 'platform'
      };
    } else {
      try {
        assertionResponse = await SimpleWebAuthnBrowser.startAuthentication(options);
      } catch (err) {
        console.error(err);
        throw new Error(`Browser authenticator prompt cancelled/failed: ${err.message}`);
      }
    }

    // 3. Update Response logs
    updateFlowDiagram('authenticator_done');
    logToTab('jsonResponse', assertionResponse);
    document.querySelector('[data-tab="tabResponse"]').click();

    // 4. Verify assertion response on server
    setConsoleIndicator('VERIFYING', true);
    updateFlowDiagram('verify_req');

    const verifyRes = await fetch('/api/login/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        response: assertionResponse,
        mock: isDemoMode ? true : undefined
      })
    });

    const verifyResult = await verifyRes.json();
    logToTab('jsonVerification', verifyResult);
    document.querySelector('[data-tab="tabVerification"]').click();

    if (verifyResult.verified) {
      setConsoleIndicator('VERIFIED');
      updateFlowDiagram('success_login');

      // Update session state
      await checkAuthSession();
    } else {
      throw new Error(verifyResult.error || 'Login verification failed');
    }

  } catch (err) {
    console.error(err);
    logToTab('jsonVerification', { error: err.message });
    document.querySelector('[data-tab="tabVerification"]').click();
    updateFlowDiagram('flow_error');
    setConsoleIndicator('ERROR');
    alert(err.message);
  }
});

// ----------------------------------------------------
// Flow 3: Session Actions & Survey Questionnaire
// ----------------------------------------------------
document.getElementById('btnLogout').addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST' });
    currentUser = null;
    renderSignedOut();
    resetFlowNodes();
  } catch (err) {
    console.error('Logout error:', err);
  }
});

document.getElementById('btnRegisterAnother').addEventListener('click', () => {
  // To register another credential for the current user:
  // Setup the registration input with the user's username
  renderSignedOut();
  signupUsername.value = currentUser.username;
  signupUsername.focus();
});

// Initial check
checkAuthSession();
