# Passkey Usability Study & Interactive Lab

An interactive web application designed for usability studies, research, and user experience analysis of Passkey (WebAuthn) registration and authentication ceremonies.

This lab offers both a simplified user-friendly flow for study participants and a comprehensive developer mode to view the low-level JSON exchanges between the client, browser, and server.

## Live Demo
Check out the live instance deployed on Vercel:
👉 **[passkeytest.purushottam.xyz](https://passkeytest.purushottam.xyz)**

---

## Key Features

### 1. Participant Guide Mode
A step-by-step description panel illustrating exactly what occurs during registration and login ceremonies. Translates complex cryptography jargon into user-friendly insights about security, privacy (biometric data never leaving the device), and anti-phishing protection.

### 2. Live Flow Visualizer
An interactive diagram updating in real-time showing the direction of network requests and hardware operations:
`Browser 💻 ──(1. Options)──> Server ☁️`  
`Browser 💻 ──(2. Verification Prompt)──> Authenticator 🔒`  
`Browser 💻 <──(3. Signature Output)── Authenticator 🔒`  
`Browser 💻 ──(4. Signature payload)──> Server ☁️`  

### 3. Developer Console & Payload Inspector
Inspects the raw JSON objects sent under the hood:
* **Server Options**: Generated options by `@simplewebauthn/server` (challenge, user/relying party parameters, allowed/excluded credentials).
* **Browser Response**: Attestation/Assertion signatures captured from `navigator.credentials.create()` or `navigator.credentials.get()`.
* **Server Verification Result**: Cryptographic validation output.

### 4. Demo Mode (Simulation)
Allows testing the interface in environments without hardware keys, biometrics (Windows Hello / TouchID), or secure origins (non-HTTPS sites) by simulating the biometric check and key generation.

### 5. Stateless Database Architecture
Uses a fully stateless backend database mechanism. Registered users are signed into a secure payload token (`dbToken`) using HMAC-SHA256 and sent to the client. The client stores it locally in `localStorage` and returns it with requests, eliminating the need for a persistent server-side database.

---

## Technology Stack
- **Core**: Node.js, Express (ESM format)
- **WebAuthn**: `@simplewebauthn/server` (v10) & `@simplewebauthn/browser` (v10)
- **Styling**: Modern, premium dark-themed vanilla CSS with fluid responsive layouts and visual glows
- **Deployment**: Vercel Serverless

---

## Local Setup

### Prerequisites
- Node.js (v18 or higher is recommended)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/purusap/passkeyTest.git
   cd passkeyTest
   ```
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Access the web console at:
   `http://localhost:3000`

---

## Deploy to Vercel

The application is fully configured for serverless runtime on Vercel (`vercel.json` maps requests to `server.js` using `@vercel/node`).

To deploy your own copy:
```bash
npx vercel --prod
```
