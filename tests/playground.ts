import * as tsm from 'ts-morph'
import { Project } from '../src/project'
import * as tags from 'common-tags'

const tsmProject = new tsm.Project({
  useVirtualFileSystem: true,
})

const mainTs = tags.stripIndent`
  import { enableProdMode } from '@angular/core'
  import { platformBrowserDynamic } from '@angular/platform-browser-dynamic'
  
  import { AppModule } from './app/app.module'
  import { environment } from './environments/environment'
  
  if (environment.production) {
    enableProdMode()
  }
  
  platformBrowserDynamic().bootstrapModule(AppModule)
    .catch(err => console.error(err))
`

const appModuleTs = tags.stripIndent`
  import { BrowserModule } from '@angular/platform-browser'
  import { NgModule } from '@angular/core'
  import { AppComponent } from './app.component'
  
  @NgModule({
    declarations: [
      AppComponent,
    ],
    imports: [
      // BrowserModule,
    ],
    bootstrap: [
      AppComponent,
    ],
  })
  export class AppModule {
  }  
`

const appComponentTs = tags.stripIndent`
  import { Component, ViewEncapsulation } from '@angular/core'
  import { ThemeService } from './services/theme.service'
  
  /* tslint:disable:component-selector */
  
  @Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    encapsulation: ViewEncapsulation.None,
  })
  export class AppComponent {
  
    public constructor () {
    }
  
  }
`


tsmProject.createSourceFile('main.ts', mainTs)
tsmProject.createSourceFile('app/app.module.ts', appModuleTs)
tsmProject.createSourceFile('app/app.component.ts', appComponentTs)

const project = new Project(tsmProject)

console.log(`Project has these Angular modules: `, project.getNgModules().map(module => module.getName()))
for (const ngModule of project.getNgModules()) {
  console.log(`NgModule ${ngModule.getName()} has these declarations:`, ngModule.getDirectDeclarations().map(declarable => declarable.getName()))
}
