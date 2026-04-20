import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Canadian GPU Availability',
  description:
    'Evidence-backed sovereignty dashboard: which current-generation GPUs you can actually launch in Canadian and G7 cloud regions today.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
