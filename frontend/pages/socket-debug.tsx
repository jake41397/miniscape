import type { NextPage } from 'next';
import Head from 'next/head';
import dynamic from 'next/dynamic';

// Dynamically import the SocketDebugger component with no SSR
// Since it uses browser APIs
const DynamicSocketDebugger = dynamic(() => import('../components/SocketDebugger'), {
  ssr: false,
  loading: () => <div>Loading debugger...</div>,
});

const SocketDebugPage: NextPage = () => {
  return (
    <div>
      <Head>
        <title>Socket Connection Debugger</title>
        <meta name="description" content="Debug socket connection issues" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main style={{ padding: '20px' }}>
        <h1 style={{ textAlign: 'center', marginBottom: '20px' }}>
          Socket Connection Debugger
        </h1>
        
        <p style={{ textAlign: 'center', marginBottom: '20px', maxWidth: '800px', margin: '0 auto' }}>
          This tool helps diagnose issues with socket connections in MiniScape.
          Click the button below to run diagnostics.
        </p>
        
        <DynamicSocketDebugger />
        
        <div style={{ marginTop: '30px', textAlign: 'center' }}>
          <a href="/" style={{ color: 'blue', textDecoration: 'underline' }}>
            Return to Home
          </a>
        </div>
      </main>
    </div>
  );
};

export default SocketDebugPage; 