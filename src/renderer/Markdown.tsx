import { createContext, isValidElement, useContext } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

type Props = {
  text: string;
};

const InsideLink = createContext(false);

const components: Components = {
  pre({ children }) {
    const child = Array.isArray(children) ? children[0] : children;
    const props = (isValidElement(child) ? child.props : {}) as {
      className?: string;
      children?: unknown;
    };
    const lang = /language-([\w-]+)/.exec(props.className ?? "")?.[1];
    const code = String(props.children ?? "").replace(/\n$/, "");
    return <CodeBlock code={code} lang={lang} />;
  },
  table({ node: _node, children, ...rest }) {
    return (
      <div className="table-scroll">
        <table {...rest}>{children}</table>
      </div>
    );
  },
  a({ node: _node, children, ...rest }) {
    return (
      <a {...rest} target="_blank" rel="noreferrer">
        <InsideLink.Provider value={true}>{children}</InsideLink.Provider>
      </a>
    );
  },
  img({ node: _node, src, alt, ...rest }) {
    const insideLink = useContext(InsideLink);
    if (!src || String(src).trim() === "") return null;
    const image = (
      <img className="md-img" loading="lazy" src={src} alt={alt ?? ""} {...rest} />
    );
    if (insideLink) return image;
    return (
      <a href={src} target="_blank" rel="noreferrer">
        {image}
      </a>
    );
  },
};

export function Markdown({ text }: Props) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
