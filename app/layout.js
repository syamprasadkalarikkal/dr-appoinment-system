import './globals.css';

export const metadata = {
  title: 'Doctor Appointment System',
  description: 'Comprehensive healthcare appointment management system',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}