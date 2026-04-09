import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Menu } from "lucide-react";

import NotFound from "@/pages/not-found";
import AccountsPage from "@/pages/accounts";
import ReportsPage from "@/pages/reports";
import TemplatesPage from "@/pages/templates";
import { AppSidebar } from "@/components/app-sidebar";

function Router() {
  return (
    <Switch>
      <Route path="/" component={AccountsPage}/>
      <Route path="/reports" component={ReportsPage}/>
      <Route path="/templates" component={TemplatesPage}/>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "18rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/20">
            <AppSidebar />
            <div className="flex flex-col flex-1 relative z-10 w-full overflow-hidden">
              
              {/* Top Navigation Bar */}
              <header className="h-16 flex items-center justify-between px-4 sm:px-8 border-b border-border/50 bg-background/80 backdrop-blur-lg sticky top-0 z-50">
                <div className="flex items-center gap-4">
                  <SidebarTrigger className="md:hidden">
                    <div className="p-2 bg-secondary rounded-lg text-foreground hover:bg-secondary/80 transition-colors cursor-pointer">
                      <Menu className="w-5 h-5" />
                    </div>
                  </SidebarTrigger>
                </div>
                <div className="flex items-center gap-4">
                  {/* Future global actions (theme toggle, user profile) could go here */}
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest bg-secondary/50 px-3 py-1.5 rounded-full">
                    Production
                  </div>
                </div>
              </header>

              {/* Main Content Area */}
              <main className="flex-1 overflow-y-auto p-4 sm:p-8">
                <Router />
              </main>

            </div>
          </div>
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
