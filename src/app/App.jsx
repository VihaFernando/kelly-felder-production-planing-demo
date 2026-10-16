import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { router } from './router';
import { ConfirmHost } from '../components/common/confirm';

export default function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ConfirmHost />
      <Toaster position="bottom-right" richColors closeButton duration={3500} toastOptions={{ style: { fontSize: 13 } }} />
    </>
  );
}
