export const BACKEND_URL = 'https://travelelite-backend.onrender.com';

export const GOOGLE_CLIENT_ID =
  '438811542163-rgnq22pb2h3gr867ejmrv2ajie6fq6vv.apps.googleusercontent.com';

export const GOOGLE_REDIRECT_URI = 'https://auth.expo.io/@travelelite/travelelite';

export const API = {
  login: `${BACKEND_URL}/api/auth/login`,
  signup: `${BACKEND_URL}/api/auth/signup`,
  verifyOTP: `${BACKEND_URL}/api/auth/verify-otp`,
  resendOTP: `${BACKEND_URL}/api/auth/resend-otp`,
  googleAuth: `${BACKEND_URL}/api/auth/google`,
  googleUserInfo: 'https://www.googleapis.com/oauth2/v2/userinfo',
  trips: `${BACKEND_URL}/api/trips`,
  reservations: `${BACKEND_URL}/api/reservations`,
  generate: `${BACKEND_URL}/api/generate`,
} as const;
