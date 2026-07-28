import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from "react";

interface HashLocation {
  pathname: string;
  search: string;
}

interface RouterValue {
  location: HashLocation;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

function currentLocation(): HashLocation {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const questionMark = raw.indexOf("?");
  const pathname = questionMark >= 0 ? raw.slice(0, questionMark) : raw;
  const search = questionMark >= 0 ? raw.slice(questionMark) : "";
  return {
    pathname: pathname.startsWith("/") ? pathname : `/${pathname}`,
    search,
  };
}

export function HashRouter({ children }: PropsWithChildren) {
  const [location, setLocation] = useState<HashLocation>(currentLocation);

  useEffect(() => {
    const update = () => setLocation(currentLocation());
    window.addEventListener("hashchange", update);
    if (!window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}#/`);
    }
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const value = useMemo<RouterValue>(
    () => ({
      location,
      navigate: (to, options) => {
        const destination = to.startsWith("/") ? to : `/${to}`;
        if (options?.replace) {
          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${window.location.search}#${destination}`,
          );
          setLocation(currentLocation());
        } else {
          window.location.hash = destination;
        }
      },
    }),
    [location],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error("Router hooks must be used inside HashRouter.");
  return value;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
};

export function Link({ to, onClick, ...props }: LinkProps) {
  return (
    <a
      href={`#${to.startsWith("/") ? to : `/${to}`}`}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      {...props}
    />
  );
}

export function NavLink({
  to,
  end = false,
  className,
  children,
  ...props
}: Omit<LinkProps, "className" | "children"> & {
  end?: boolean;
  className?: string | ((state: { isActive: boolean }) => string);
  children?: ReactNode;
}) {
  const { location } = useRouter();
  const target = to.split("?")[0] ?? "/";
  const isActive =
    location.pathname === target ||
    (!end && target !== "/" && location.pathname.startsWith(`${target}/`));
  const resolvedClassName =
    typeof className === "function" ? className({ isActive }) : className;
  return (
    <Link
      to={to}
      className={resolvedClassName}
      aria-current={isActive ? "page" : undefined}
      {...props}
    >
      {children}
    </Link>
  );
}

export function useLocation(): HashLocation {
  return useRouter().location;
}

export function useNavigate(): RouterValue["navigate"] {
  return useRouter().navigate;
}

export function useSearchParams(): readonly [URLSearchParams] {
  const { search } = useRouter().location;
  return useMemo(() => [new URLSearchParams(search)] as const, [search]);
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => navigate(to, { replace }), [navigate, replace, to]);
  return null;
}
