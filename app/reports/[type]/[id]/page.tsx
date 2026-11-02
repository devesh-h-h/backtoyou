import ReportDetail from "@/components/ReportDetail";

type ReportDetailPageProps = {
  params: Promise<{
    type: string;
    id: string;
  }>;
};

export default async function ReportDetailPage({
  params,
}: ReportDetailPageProps) {
  const routeParams = await params;
  return <ReportDetail type={routeParams.type} id={routeParams.id} />;
}
