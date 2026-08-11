export default function MiniCheeseWheel({ spinning = false, onReady }) {
  return (
    <img
      className={`auth-logo mini-cheese-wheel${spinning ? ' is-spinning' : ''}`}
      src="/cheese-loader.png"
      alt=""
      aria-hidden="true"
      onLoad={onReady}
      onError={onReady}
    />
  );
}
