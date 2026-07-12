import { generateRegistrationOptions } from '@simplewebauthn/server';

const RP_NAME = 'Passkey Usability Study Lab';
const rpID = 'localhost';
const userID = crypto.randomUUID();

try {
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpID,
    userID: new TextEncoder().encode(userID),
    userName: 'test_user',
    userDisplayName: 'test_user',
    attestationType: 'none',
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'preferred',
    },
  });

  console.log('GENERATED OPTIONS:');
  console.log(JSON.stringify(options, null, 2));
} catch (err) {
  console.error('Error:', err);
}
