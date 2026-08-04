import type { Metadata } from "next";
import Game from "./game";

export const metadata: Metadata = {
  title: "FRONTLINE // Conquest",
  description: "A first-person Three.js conquest combat prototype.",
};

export default function Home() {
  return <Game />;
}
