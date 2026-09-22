type Props = {
  terminalId: string;
  onStartNew: () => void;
  onCloseSelf: () => void;
};

export function PanelTerminal({ terminalId, onStartNew, onCloseSelf }: Props) {
  void onStartNew;
  void onCloseSelf;
  return <div className="panel-terminal" data-terminal-id={terminalId} />;
}
