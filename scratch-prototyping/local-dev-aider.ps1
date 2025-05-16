# running `pipx install --editable D:\7ur-home\dev\external\aider` of https://github.com/Aider-AI/aider/pull/3480 - feat: use copy-paste instead of api
# thanks https://chatgpt.com/c/6826bad1-ea74-800c-be54-668b4ae01b2a
# pipx install --editable D:\7ur-home\dev\external\aider


# actually see .aider.conf.yml and aider-fileset.py


# Start-Process -FilePath 'D:\7ur-home\git\external\aider\.venv\Scripts\python.exe' `
#               -ArgumentList ( @('-m','aider') + $args ) `
#               -NoNewWindow -Wait `
#               -Environment @{ PYTHONPATH = 'D:\7ur-home\git\external\aider' }



# OLD NOTE: cloned aider, made a venv, activated it, pip installed requirements/*.txt, did `pip install -e .`, now `python -m aider` from the venv runs the .py files in the repo via linking magic
# so now i can preview https://github.com/Aider-AI/aider/pull/3480/files `feat: use copy-paste instead of api`