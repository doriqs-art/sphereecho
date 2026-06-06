import dynamic from "next/dynamic";

const CodropScene = dynamic(
  () => import("../components/CodropScene").then((mod) => mod.CodropScene),
  { ssr: false }
);

export default function Home() {
  return <CodropScene />;
}
