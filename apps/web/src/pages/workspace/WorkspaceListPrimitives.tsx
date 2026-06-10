import { Button, Statistic } from 'antd';

type WorkspaceSummaryItem = {
  key: string;
  label: string;
  value: string | number;
  active?: boolean;
  onClick?: () => void;
};

export function WorkspaceSummaryStrip({ items, ariaLabel }: { items: WorkspaceSummaryItem[]; ariaLabel: string }) {
  return (
    <section className="production-summary-strip workspace-fixed-summary" aria-label={ariaLabel}>
      {items.map((item) => item.onClick ? (
        <Button
          key={item.key}
          className="production-summary-item"
          type={item.active ? 'primary' : 'text'}
          onClick={item.onClick}
        >
          <Statistic title={item.label} value={item.value} />
        </Button>
      ) : (
        <div key={item.key} className="production-summary-item">
          <Statistic title={item.label} value={item.value} />
        </div>
      ))}
    </section>
  );
}
