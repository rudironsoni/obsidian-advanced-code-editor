# Horizontal scroll gutter blank lines

This fixture verifies that Live Preview paints the code block gutter continuously across blank code lines.

```py title="PyCharm Django Console fixes"
import builtins, os, runpy, sys
print('Python %s on %s' % (sys.version, sys.platform))
import django

print('Django %s' % django.get_version())

sys.path.extend(['/app/src', '/opt/.pycharm_helpers/pycharm'])
os.chdir('/app/src')

if 'setup' in dir(django): django.setup()

sys.argv = [
    'manage.py',
    'shell_plus',
]
runpy.run_path('/app/src' + '/manage.py', run_name='__main__', init_globals={'console_namespace_marker': 'alpha-0123456789-beta-0123456789-gamma-0123456789-delta-0123456789'})
```

After the block.
