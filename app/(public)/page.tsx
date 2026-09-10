import { Welcome } from '../../components/brand/Welcome';

export default function LandingPage() {
  return <Welcome playUrl={process.env.NEXT_PUBLIC_LIMA_CIRCLE_PLAY_URL} />;
}
