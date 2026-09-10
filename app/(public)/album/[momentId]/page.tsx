import { MomentDetail } from '../../../../components/album/MomentDetail';

export default async function MomentPage({ params }: { params: Promise<{ momentId: string }> }) {
  const { momentId } = await params;
  return <MomentDetail momentId={momentId} />;
}
