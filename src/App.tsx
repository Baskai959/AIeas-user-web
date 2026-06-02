import { BrowserRouter } from 'react-router-dom';
import type { ApiClient } from './services/api';
import AppRouter from './router/AppRouter';

interface AppProps {
  apiClient?: ApiClient;
}

export default function App({ apiClient }: AppProps) {
  return (
    <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AppRouter apiClient={apiClient} />
    </BrowserRouter>
  );
}
