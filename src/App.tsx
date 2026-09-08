import Navbar from "./components/Navbar";
import TokenPage from "./components/TokenPage";
import { useRoute } from "./lib/router";
import Hero from "./components/Hero";
import About from "./components/sections/About";
import Vault from "./components/sections/Vault";
import Tokenomics from "./components/sections/Tokenomics";
import HowToBuy from "./components/sections/HowToBuy";
import Giveaway from "./components/sections/Giveaway";
import Roadmap from "./components/sections/Roadmap";
import Launches from "./components/sections/Launches";
import Create from "./components/sections/Create";
import Community from "./components/sections/Community";
import FAQ from "./components/sections/FAQ";
import Footer from "./components/sections/Footer";

/**
 * Section order is the launch page skeleton. /build-sections adds, removes or reorders here.
 *
 * Two routes now: this page, and `/token/0x…`. The navbar and footer are shared, so a token page
 * still looks like part of the site rather than a detached view.
 *
 * ⚠ `/token/…` is a real path, which needs an SPA fallback on the host or every refresh 404s. See
 * `lib/router.ts` and `public/_redirects`.
 */
export default function App() {
  const route = useRoute();

  if (route.name === "token") {
    return (
      <>
        <Navbar />
        <TokenPage address={route.address} />
        <Footer />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main>
        <Hero />
        {/* The board of launches, then the form that adds to it: both sit right under the banner they
            feed, before the page starts explaining itself. */}
        <Launches />
        <Create />
        <About />
        <Vault />
        <Tokenomics />
        <HowToBuy />
        <Giveaway />
        <Roadmap />
        <FAQ />
        <Community />
      </main>
      <Footer />
    </>
  );
}
