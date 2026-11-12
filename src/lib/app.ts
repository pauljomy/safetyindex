// Store links for the app button, built from scripts/config.yml (brief section 15).
import { config } from "../../scripts/lib/config.mjs";
import { site } from "../config/site.mjs";

export function appLinks(market: string, checklistId: string) {
  const id = checklistId.replace(/\//g, "-");
  const referrer = encodeURIComponent(`utm_source=safetyindex&utm_medium=checklist&utm_campaign=${market}&utm_content=${id}`);
  return {
    play: `https://play.google.com/store/apps/details?id=${config.android_package}&referrer=${referrer}`,
    appStore: `https://apps.apple.com/app/id${config.ios_app_id}?pt=${config.ios_provider_token}&ct=${market}-${id}&mt=8`,
    redirect: `${site.url}/get-app/?c=${encodeURIComponent(id)}`,
  };
}
