import type { MetadataRoute } from "next";
import { publicRobots } from "../public-discovery/site";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return publicRobots();
}
