import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from "react";

interface HashLocation {
  pathname: string;
  search: string;
}

/** Resolves true when navigation may proceed (the user chose to leave). */
export type NavigationBlocker = () => Promise<boolean>;

interface RouterValue {
  location: HashLocation;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  /** In-app navigation (Link clicks, Back/Forward) asks the blocker first. */
  setBlocker: (blocker: NavigationBlocker | null) => void;
  getBlocker: () => NavigationBlocker | null;
  /** Marks a hash as accepted so its hashchange is not intercepted. */
  accept: (hash: string) => void;
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
  const blockerRef = useRef<NavigationBlocker | null>(null);
  const acceptedHash = useRef("");

  useEffect(() => {
    acceptedHash.current = window.location.hash || "#/";
    const update = () => {
      const next = window.location.hash || "#/";
      const blocker = blockerRef.current;
      if (blocker && next !== acceptedHash.current) {
        // Back/Forward away from a guarded view: restore its URL, then ask.
        const guarded = acceptedHash.current;
        window.history.pushState(
          null,
          "",
          `${window.location.pathname}${window.location.search}${guarded}`,
        );
        void blocker().then((leave) => {
          if (!leave) return;
          blockerRef.current = null;
          acceptedHash.current = next;
          // The restored entry sits right after the one the user went to (for Back
          // and Forward alike), so step back onto it instead of pushing another.
          window.history.back();
        });
        return;
      }
      acceptedHash.current = next;
      setLocation(currentLocation());
    };
    window.addEventListener("hashchange", update);
    if (!window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}#/`);
    }
    return () => window.removeEventListener("hashchange", update);
  }, []);

  const setBlocker = useCallback((blocker: NavigationBlocker | null) => {
    blockerRef.current = blocker;
  }, []);
  const getBlocker = useCallback(() => blockerRef.current, []);
  const accept = useCallback((hash: string) => {
    acceptedHash.current = hash;
  }, []);

  const value = useMemo<RouterValue>(
    () => ({
      location,
      navigate: (to, options) => {
        const destination = to.startsWith("/") ? to : `/${to}`;
        // Programmatic navigation comes from the view itself (after a save),
        // so the view's own guard never intercepts it.
        acceptedHash.current = `#${destination}`;
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
      setBlocker,
      getBlocker,
      accept,
    }),
    [accept, getBlocker, location, setBlocker],
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

function scrollToTop() {
  // JS scroll options ignore the CSS reduced-motion override, so honour it here
  // (matchMedia is absent in the jsdom test harness).
  const reduced =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
}

export function Link({ to, onClick, ...props }: LinkProps) {
  const router = useContext(RouterContext);
  const destination = to.startsWith("/") ? to : `/${to}`;
  return (
    <a
      href={`#${destination}`}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
          return;
        }
        const blocker = router?.getBlocker();
        if (router && blocker && window.location.hash !== `#${destination}`) {
          event.preventDefault();
          void blocker().then((leave) => {
            if (!leave) return;
            router.setBlocker(null);
            router.accept(`#${destination}`);
            window.location.hash = destination;
            scrollToTop();
          });
          return;
        }
        scrollToTop();
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

/**
 * Guards a dirty form: in-app navigation asks `ask` first, and closing or
 * reloading the tab raises the browser's own leave prompt.
 */
export function useNavigationGuard(when: boolean, ask: NavigationBlocker) {
  const { setBlocker } = useRouter();
  useEffect(() => {
    if (!when) return;
    setBlocker(ask);
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      setBlocker(null);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [ask, setBlocker, when]);
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => navigate(to, { replace }), [navigate, replace, to]);
  return null;
}
