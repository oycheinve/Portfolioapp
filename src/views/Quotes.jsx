import LivePricesCard from '../components/dashboard/LivePricesCard.jsx';

// Notowania: kursy instrumentów, kursy walut i przelicznik
export default function QuotesView() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <LivePricesCard />
    </div>
  );
}
