import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

type GoogleBridgeToken = {
  googleId?: string;
  firstName?: string;
  lastName?: string;
  isGoogleUser?: boolean;
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "google") {
        const bridgeToken = token as typeof token & GoogleBridgeToken;
        bridgeToken.googleId = account.providerAccountId;
        bridgeToken.firstName = (profile as any)?.given_name ?? "";
        bridgeToken.lastName = (profile as any)?.family_name ?? "";
        bridgeToken.isGoogleUser = true;
      }

      return token;
    },
    async session({ session, token }) {
      const bridgeToken = token as typeof token & GoogleBridgeToken;
      (session.user as any).googleId = bridgeToken.googleId;
      (session.user as any).firstName = bridgeToken.firstName;
      (session.user as any).lastName = bridgeToken.lastName;
      (session.user as any).isGoogleUser = bridgeToken.isGoogleUser;
      return session;
    },
    async redirect({ baseUrl }) {
      return `${baseUrl}/auth/google-callback`;
    },
  },
});
