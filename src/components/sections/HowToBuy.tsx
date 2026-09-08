import { Wallet, Coins, ArrowLeftRight, PartyPopper } from "lucide-react";
import { CHAINS, buyLink, config, isLive } from "../../lib/config";
import Button from "../ui/Button";
import CopyAddress from "../ui/CopyAddress";
import Section from "../ui/Section";

export default function HowToBuy() {
  const s = config.token.symbol;
  const chain = CHAINS[config.token.chain].label;
  const buy = buyLink();
  const steps = [
    {
      icon: Wallet,
      title: "Get a wallet",
      text: `MetaMask, Coinbase Wallet or Rabby. Add the ${chain} network if your wallet does not list it.`,
    },
    {
      icon: Coins,
      title: `Get ETH on ${chain}`,
      text: "Buy ETH on an exchange and withdraw to this network, or bridge from Ethereum. A few dollars covers gas for months.",
    },
    {
      icon: ArrowLeftRight,
      title: `Swap for $${s}`,
      text: `Open the swap link below, paste the contract address, set a 2 to 5% slippage and swap on ${chain}.`,
    },
    {
      icon: PartyPopper,
      title: "You are in",
      text: `Add $${s} to your wallet with the contract address to see your balance. Join the community.`,
    },
  ];

  return (
    <Section
      id="how-to-buy"
      eyebrow="How to buy"
      title="Three clicks. No gatekeeping."
      image="/sections/how-to-buy.webp"
      line="Keystone drew you a map"
      imageSide="left"
      /* the map is at his right, and the frame crops a sixth off each side */
      focal="64% 50%"
    >
      <ol className="grid gap-4 sm:grid-cols-2">
        {steps.map((st, i) => (
          <li key={st.title} className="panel relative p-5">
            <span className="absolute right-5 top-5 font-pixel text-3xl text-fg/[0.08]">0{i + 1}</span>
            <div className="pixel-frame mb-5 grid h-11 w-11 place-items-center bg-accent2/15 text-accent2">
              <st.icon className="h-5 w-5" />
            </div>
            <h3 className="font-pixel text-[15px] leading-[1.5] text-fg">{st.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">{st.text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
        <CopyAddress full />
        <Button href={buy ?? undefined} disabled={!isLive}>
          {isLive ? "Open Uniswap" : "Launching soon"}
        </Button>
      </div>
    </Section>
  );
}
