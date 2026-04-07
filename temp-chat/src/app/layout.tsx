import type { Metadata } from "next";
import { IBM_Plex_Mono, Sora } from "next/font/google";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Temp Chat Rooms",
  description: "Minimal real-time temporary chat rooms with room codes.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await auth();
  return (
    <html lang="en">
      <body className={`${sora.variable} ${plexMono.variable} antialiased`}>
        <ClerkProvider>
          <header className="border-b border-border/70 bg-card/70">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-end gap-3 px-6 py-3 text-sm">
              <Show when="signed-out">
                <SignInButton />
                <SignUpButton />
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </div>
          </header>
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
