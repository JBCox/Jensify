import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { OrganizationService } from "../../../core/services/organization.service";
import { UserRole } from "../../../core/models/enums";
import { EmployeeDashboard } from "../employee-dashboard/employee-dashboard";
import { ManagerDashboard } from "../manager-dashboard/manager-dashboard";
import { FinanceDashboard } from "../finance-dashboard/finance-dashboard";
import { AdminDashboard } from "../admin-dashboard/admin-dashboard";
import { Observable } from "rxjs";
import { map, tap } from "rxjs/operators";

@Component({
  selector: "app-home",
  imports: [
    CommonModule,
    EmployeeDashboard,
    ManagerDashboard,
    FinanceDashboard,
    AdminDashboard,
  ],
  templateUrl: "./home.html",
  styleUrl: "./home.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Home implements OnInit {
  private organizationService = inject(OrganizationService);

  userRole$!: Observable<UserRole>;
  UserRole = UserRole;

  ngOnInit(): void {
    // Get user's role from organization membership
    this.userRole$ = this.organizationService.currentMembership$.pipe(
      tap((membership) => console.log("Home: Current membership:", membership)),
      map((membership) => {
        const role = (membership?.role as UserRole) || UserRole.EMPLOYEE;
        console.log("Home: Resolved role:", role);
        return role;
      }),
    );
  }
}
